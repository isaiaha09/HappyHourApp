from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.utils.text import slugify
from rest_framework import serializers

from .models import BusinessClaim, City, ListingSnapshot, VenueType


class AccountResponseSerializer(serializers.Serializer):
	id = serializers.IntegerField()
	username = serializers.CharField()
	email = serializers.EmailField()
	first_name = serializers.CharField()
	last_name = serializers.CharField()
	portal = serializers.CharField()
	profile_type = serializers.CharField()
	business_status = serializers.CharField(required=False, allow_blank=True)
	claim_id = serializers.IntegerField(required=False, allow_null=True)
	claim_status = serializers.CharField(required=False, allow_null=True)
	business_name = serializers.CharField(required=False, allow_blank=True)


def build_account_response(user, portal, claim=None):
	claims = list(user.business_claims.select_related('listing_snapshot').order_by('-created_at'))
	memberships = list(user.business_memberships.select_related('claim__listing_snapshot').all())
	active_membership = next((membership for membership in memberships if membership.is_active), None)
	primary_claim = claim or (claims[0] if claims else None)

	if active_membership:
		business_status = 'approved'
		profile_type = 'business'
	elif primary_claim:
		business_status = primary_claim.status
		profile_type = 'business' if portal == 'business' else 'customer'
	else:
		business_status = ''
		profile_type = 'customer'

	return AccountResponseSerializer({
		'id': user.id,
		'username': user.username,
		'email': user.email,
		'first_name': user.first_name,
		'last_name': user.last_name,
		'portal': portal,
		'profile_type': profile_type,
		'business_status': business_status,
		'claim_id': primary_claim.id if primary_claim else None,
		'claim_status': primary_claim.status if primary_claim else None,
		'business_name': primary_claim.listing_snapshot.name if primary_claim else '',
	}).data


class LoginSerializer(serializers.Serializer):
	portal = serializers.ChoiceField(choices=['customer', 'business'])
	identifier = serializers.CharField(max_length=150)
	password = serializers.CharField(write_only=True, style={'input_type': 'password'})

	def validate(self, attrs):
		identifier = attrs['identifier'].strip()
		user = User.objects.filter(username__iexact=identifier).first()
		if user is None:
			user = User.objects.filter(email__iexact=identifier.lower()).first()
		if user is None:
			raise serializers.ValidationError('No account matches that username or email.')

		authenticated_user = authenticate(username=user.username, password=attrs['password'])
		if authenticated_user is None:
			raise serializers.ValidationError('Incorrect password.')

		if attrs['portal'] == 'business' and not (
			authenticated_user.business_claims.exists() or authenticated_user.business_memberships.exists()
		):
			raise serializers.ValidationError('That account does not have a business profile or claim yet.')

		attrs['user'] = authenticated_user
		return attrs

	def to_representation(self, instance):
		portal = self.validated_data['portal']
		return build_account_response(instance, portal)


class CustomerSignupSerializer(serializers.Serializer):
	username = serializers.CharField(max_length=150)
	email = serializers.EmailField()
	password = serializers.CharField(min_length=8, write_only=True, style={'input_type': 'password'})
	first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
	last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)

	def validate_username(self, value):
		if User.objects.filter(username__iexact=value).exists():
			raise serializers.ValidationError('That username is already in use.')
		return value.strip()

	def validate_email(self, value):
		normalized = value.strip().lower()
		if User.objects.filter(email__iexact=normalized).exists():
			raise serializers.ValidationError('That email is already in use.')
		return normalized

	def create(self, validated_data):
		password = validated_data.pop('password')
		return User.objects.create_user(password=password, **validated_data)

	def to_representation(self, instance):
		return build_account_response(instance, 'customer')


class ClaimedBusinessSignupSerializer(CustomerSignupSerializer):
	business_slug = serializers.SlugField(write_only=True)
	contact_name = serializers.CharField(max_length=120)
	job_title = serializers.CharField(max_length=120)
	work_email = serializers.EmailField()
	work_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
	employer_address = serializers.CharField(max_length=255)
	address_not_applicable = serializers.BooleanField(default=False)
	verification_summary = serializers.CharField(max_length=2000)
	supporting_details = serializers.CharField(max_length=4000, required=False, allow_blank=True)

	def validate(self, attrs):
		attrs = super().validate(attrs)
		if attrs.get('address_not_applicable'):
			raise serializers.ValidationError({'address_not_applicable': ['Address Not Applicable is only available when you create a new business profile.']})
		return attrs

	def create(self, validated_data):
		listing_snapshot = validated_data.pop('listing_snapshot')
		validated_data.pop('business_slug', None)
		claim_data = {
			'contact_name': validated_data.pop('contact_name'),
			'job_title': validated_data.pop('job_title'),
			'work_email': validated_data.pop('work_email'),
			'work_phone': validated_data.pop('work_phone', ''),
			'employer_address': validated_data.pop('employer_address'),
			'address_not_applicable': validated_data.pop('address_not_applicable', False),
			'verification_summary': validated_data.pop('verification_summary'),
			'supporting_details': validated_data.pop('supporting_details', ''),
		}
		password = validated_data.pop('password')

		user = User.objects.create_user(password=password, **validated_data)
		claim = BusinessClaim.objects.create(
			claimant=user,
			listing_snapshot=listing_snapshot,
			status=BusinessClaim.Status.SUBMITTED,
			**claim_data,
		)
		claim.submit_for_review()
		user._created_business_claim = claim
		return user

	def to_representation(self, instance):
		claim = getattr(instance, '_created_business_claim', None)
		return build_account_response(instance, 'business', claim)


class ManualBusinessSignupSerializer(CustomerSignupSerializer):
	business_name = serializers.CharField(max_length=150)
	business_city = serializers.ChoiceField(choices=City.choices, required=False, allow_blank=True)
	business_venue_type = serializers.ChoiceField(choices=VenueType.choices, required=False, allow_blank=True)
	business_website_url = serializers.URLField(required=False, allow_blank=True)
	contact_name = serializers.CharField(max_length=120)
	job_title = serializers.CharField(max_length=120, required=False, allow_blank=True)
	work_email = serializers.EmailField()
	work_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
	employer_address = serializers.CharField(max_length=255, required=False, allow_blank=True)
	address_not_applicable = serializers.BooleanField(default=False)
	verification_summary = serializers.CharField(max_length=2000)
	supporting_details = serializers.CharField(max_length=4000, required=False, allow_blank=True)

	def validate(self, attrs):
		attrs = super().validate(attrs)
		if not attrs.get('address_not_applicable') and not attrs.get('employer_address'):
			raise serializers.ValidationError({'employer_address': ['Employer address is required unless you mark Address Not Applicable.']})
		return attrs

	def create(self, validated_data):
		listing_snapshot = ListingSnapshot.objects.create(
			name=validated_data.pop('business_name'),
			city=validated_data.pop('business_city', ''),
			venue_type=validated_data.pop('business_venue_type', ''),
			address_line_1=validated_data.get('employer_address') or 'Address Not Applicable',
			website_url=validated_data.pop('business_website_url', ''),
			source_name=BusinessClaim.MANUAL_SOURCE_NAME,
			external_id=f'manual-{slugify(validated_data.get("username", "business"))}',
		)

		claim_data = {
			'contact_name': validated_data.pop('contact_name'),
			'job_title': validated_data.pop('job_title', ''),
			'work_email': validated_data.pop('work_email'),
			'work_phone': validated_data.pop('work_phone', ''),
			'employer_address': validated_data.pop('employer_address', ''),
			'address_not_applicable': validated_data.pop('address_not_applicable', False),
			'verification_summary': validated_data.pop('verification_summary'),
			'supporting_details': validated_data.pop('supporting_details', ''),
		}
		password = validated_data.pop('password')
		user = User.objects.create_user(password=password, **validated_data)
		claim = BusinessClaim.objects.create(
			claimant=user,
			listing_snapshot=listing_snapshot,
			status=BusinessClaim.Status.SUBMITTED,
			**claim_data,
		)
		claim.submit_for_review()
		user._created_business_claim = claim
		return user

	def to_representation(self, instance):
		claim = getattr(instance, '_created_business_claim', None)
		return build_account_response(instance, 'business', claim)


def sync_listing_snapshot_from_place_payload(payload):
	primary_location = (payload.get('locations') or [payload])[0]
	city = str(primary_location.get('city') or payload.get('city') or '').strip().lower()
	venue_type = str(primary_location.get('venue_type') or payload.get('venue_type') or '').strip().lower()

	defaults = {
		'name': payload.get('name', ''),
		'city': city if city in City.values else '',
		'venue_type': venue_type if venue_type in VenueType.values else '',
		'address_line_1': primary_location.get('address_line_1', '') or payload.get('address_line_1', ''),
		'address_line_2': primary_location.get('address_line_2', '') or payload.get('address_line_2', ''),
		'neighborhood': primary_location.get('neighborhood', '') or payload.get('neighborhood', ''),
		'state': primary_location.get('state', '') or payload.get('state', '') or 'CA',
		'postal_code': primary_location.get('postal_code', '') or payload.get('postal_code', ''),
		'phone_number': primary_location.get('phone_number', '') or payload.get('phone_number', ''),
		'website_url': primary_location.get('website_url', '') or payload.get('website_url', ''),
		'source_name': 'business_websites',
		'source_url': primary_location.get('website_url', '') or payload.get('website_url', ''),
		'external_id': payload.get('slug', ''),
		'listing_slug': payload.get('slug', ''),
	}

	snapshot, _ = ListingSnapshot.objects.update_or_create(
		listing_slug=payload.get('slug', ''),
		defaults=defaults,
	)
	return snapshot


class HappyHourSerializer(serializers.Serializer):
	id = serializers.IntegerField()
	weekday = serializers.IntegerField()
	weekday_label = serializers.CharField()
	start_time = serializers.CharField()
	end_time = serializers.CharField()
	all_day = serializers.BooleanField()


class OperatingHourSerializer(serializers.Serializer):
	id = serializers.IntegerField()
	weekday = serializers.IntegerField()
	weekday_label = serializers.CharField()
	open_time = serializers.CharField()
	close_time = serializers.CharField()


class DealSerializer(serializers.Serializer):
	id = serializers.IntegerField()
	title = serializers.CharField()
	description = serializers.CharField()
	deal_type = serializers.CharField()
	deal_type_label = serializers.CharField()
	price_text = serializers.CharField()
	terms = serializers.CharField()
	is_active = serializers.BooleanField()
	starts_on = serializers.CharField(allow_null=True)
	ends_on = serializers.CharField(allow_null=True)
	happy_hours = HappyHourSerializer(many=True)


class PlaceLocationSerializer(serializers.Serializer):
	id = serializers.IntegerField()
	slug = serializers.CharField()
	name = serializers.CharField()
	city = serializers.CharField()
	city_label = serializers.CharField()
	venue_type = serializers.CharField()
	venue_type_label = serializers.CharField()
	address_line_1 = serializers.CharField()
	address_line_2 = serializers.CharField()
	neighborhood = serializers.CharField()
	state = serializers.CharField()
	postal_code = serializers.CharField()
	latitude = serializers.FloatField(allow_null=True)
	longitude = serializers.FloatField(allow_null=True)
	phone_number = serializers.CharField()
	website_url = serializers.CharField()
	image_urls = serializers.ListField(child=serializers.CharField(), required=False, default=list)
	operating_hours = OperatingHourSerializer(many=True, required=False, default=list)
	is_active = serializers.BooleanField()


class PlaceLocationDetailSerializer(PlaceLocationSerializer):
	deals = DealSerializer(many=True)


class PlaceListSerializer(serializers.Serializer):
	id = serializers.IntegerField()
	name = serializers.CharField()
	slug = serializers.CharField()
	city = serializers.CharField()
	city_label = serializers.CharField()
	venue_type = serializers.CharField()
	venue_type_label = serializers.CharField()
	address_line_1 = serializers.CharField()
	address_line_2 = serializers.CharField()
	neighborhood = serializers.CharField()
	state = serializers.CharField()
	postal_code = serializers.CharField()
	latitude = serializers.FloatField(allow_null=True)
	longitude = serializers.FloatField(allow_null=True)
	phone_number = serializers.CharField()
	website_url = serializers.CharField()
	image_urls = serializers.ListField(child=serializers.CharField(), required=False, default=list)
	is_active = serializers.BooleanField()
	locations = PlaceLocationSerializer(many=True, required=False, default=list)


class PlaceDetailSerializer(PlaceListSerializer):
	deals = DealSerializer(many=True)
	locations = PlaceLocationDetailSerializer(many=True, required=False, default=list)
