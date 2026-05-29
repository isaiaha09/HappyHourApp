from django.contrib.auth.password_validation import validate_password
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils.text import slugify
from rest_framework import serializers

from .models import BusinessClaim, City, ListingSnapshot, VenueType
from .services.account_profiles import build_account_response, get_or_create_account_profile


class AccountResponseSerializer(serializers.Serializer):
	id = serializers.IntegerField()
	username = serializers.CharField()
	email = serializers.EmailField()
	first_name = serializers.CharField()
	last_name = serializers.CharField()
	detail = serializers.CharField(required=False, allow_blank=True)
	portal = serializers.CharField()
	profile_type = serializers.CharField()
	auth_token = serializers.CharField(required=False, allow_blank=True)
	business_status = serializers.CharField(required=False, allow_blank=True)
	claim_id = serializers.IntegerField(required=False, allow_null=True)
	claim_status = serializers.CharField(required=False, allow_null=True)
	business_name = serializers.CharField(required=False, allow_blank=True)
	email_verified = serializers.BooleanField(required=False)
	email_verification_sent_at = serializers.DateTimeField(required=False, allow_null=True)
	email_verification_required = serializers.BooleanField(required=False)
	verification_code_expires_at = serializers.DateTimeField(required=False, allow_null=True)
	verification_code_ttl_seconds = serializers.IntegerField(required=False)
	two_factor_enabled = serializers.BooleanField(required=False)
	billing_portal_url = serializers.CharField(required=False, allow_blank=True)
	approved_businesses = serializers.ListField(child=serializers.DictField(), required=False)
	business_contact = serializers.DictField(required=False)
	can_access_places = serializers.BooleanField(required=False)
	two_factor_pending_setup = serializers.BooleanField(required=False)
	requires_business_location_tracking = serializers.BooleanField(required=False)
	tracked_business_location = serializers.DictField(required=False)


class LoginSerializer(serializers.Serializer):
	portal = serializers.ChoiceField(choices=['customer', 'business'])
	identifier = serializers.CharField(max_length=150)
	password = serializers.CharField(write_only=True, style={'input_type': 'password'})
	two_factor_code = serializers.CharField(max_length=12, required=False, allow_blank=True, write_only=True)

	def validate(self, attrs):
		identifier = attrs['identifier'].strip()
		user = User.objects.filter(username__iexact=identifier).first()
		if user is None:
			raise serializers.ValidationError('No account matches that username.')

		authenticated_user = authenticate(username=user.username, password=attrs['password'])
		if authenticated_user is None:
			raise serializers.ValidationError('Incorrect password.')

		if attrs['portal'] == 'business' and not (
			authenticated_user.business_claims.exists() or authenticated_user.business_memberships.exists()
		):
			raise serializers.ValidationError('That account does not have a business profile or claim yet.')

		profile = get_or_create_account_profile(authenticated_user)
		if not profile.email_is_verified:
			attrs['user'] = authenticated_user
			attrs['email_verification_required'] = True
			return attrs

		if profile.two_factor_enabled:
			code = attrs.get('two_factor_code', '')
			if not code:
				raise serializers.ValidationError({'two_factor_code': ['Enter the 6-digit code from your authenticator app.']})
			if not profile.verify_two_factor_code(code):
				raise serializers.ValidationError({'two_factor_code': ['The authenticator code is invalid or expired.']})

		attrs['user'] = authenticated_user
		return attrs


class EmailVerificationCodeSerializer(serializers.Serializer):
	username = serializers.CharField(max_length=150)
	code = serializers.CharField(max_length=12, write_only=True)
	portal = serializers.ChoiceField(choices=['customer', 'business'], required=False, allow_blank=True)

	def validate_username(self, value):
		normalized = value.strip()
		if not normalized:
			raise serializers.ValidationError('Enter your username.')
		return normalized

	def validate_code(self, value):
		normalized = ''.join(character for character in str(value or '') if character.isdigit())
		if len(normalized) != 6:
			raise serializers.ValidationError('Enter the 6-digit verification code.')
		return normalized


class ResendEmailVerificationCodeSerializer(serializers.Serializer):
	username = serializers.CharField(max_length=150)
	portal = serializers.ChoiceField(choices=['customer', 'business'], required=False, allow_blank=True)

	def validate_username(self, value):
		normalized = value.strip()
		if not normalized:
			raise serializers.ValidationError('Enter your username.')
		return normalized


class UsernameReminderSerializer(serializers.Serializer):
	email = serializers.EmailField()

	def validate_email(self, value):
		return value.strip().lower()


class PasswordResetRequestSerializer(serializers.Serializer):
	identifier = serializers.CharField(max_length=150)

	def validate_identifier(self, value):
		return value.strip()


class PasswordResetConfirmSerializer(serializers.Serializer):
	token = serializers.CharField(max_length=128)
	new_password = serializers.CharField(min_length=8, write_only=True, style={'input_type': 'password'})

	def validate(self, attrs):
		from .models import AccountProfile

		profile = AccountProfile.objects.select_related('user').filter(password_reset_token=attrs['token']).first()
		if profile is None:
			raise serializers.ValidationError({'token': ['That password reset link is invalid or expired.']})

		try:
			validate_password(attrs['new_password'], user=profile.user)
		except DjangoValidationError as error:
			raise serializers.ValidationError({'new_password': list(error.messages)})

		attrs['profile'] = profile
		return attrs


class TwoFactorCodeSerializer(serializers.Serializer):
	code = serializers.CharField(max_length=12)
	portal = serializers.ChoiceField(choices=['customer', 'business'], required=False)

	def validate_code(self, value):
		normalized = ''.join(character for character in str(value or '') if character.isdigit())
		if len(normalized) != 6:
			raise serializers.ValidationError('Enter a valid 6-digit authenticator code.')
		return normalized


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
		user = User.objects.create_user(password=password, **validated_data)
		get_or_create_account_profile(user)
		return user


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
		is_mobile_business = attrs.get('business_venue_type') == VenueType.MOBILE
		if is_mobile_business and not attrs.get('employer_address'):
			attrs['address_not_applicable'] = True
		if not attrs.get('address_not_applicable') and not attrs.get('employer_address'):
			raise serializers.ValidationError({'employer_address': ['Employer address is required unless you mark Address Not Applicable.']})
		return attrs

	def create(self, validated_data):
		business_venue_type = validated_data.pop('business_venue_type', '')
		is_mobile_business = business_venue_type == VenueType.MOBILE
		listing_address = validated_data.get('employer_address') or ('Approximate live location' if is_mobile_business else 'Address Not Applicable')
		listing_snapshot = ListingSnapshot.objects.create(
			name=validated_data.pop('business_name'),
			city=validated_data.pop('business_city', ''),
			venue_type=business_venue_type,
			address_line_1=listing_address,
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


class BusinessLocationUpdateSerializer(serializers.Serializer):
	latitude = serializers.FloatField(min_value=-90, max_value=90)
	longitude = serializers.FloatField(min_value=-180, max_value=180)
	accuracy_meters = serializers.FloatField(required=False, allow_null=True, min_value=0)


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
	has_deals = serializers.BooleanField(required=False, default=False)
	deal_count = serializers.IntegerField(required=False, default=0)
	operating_weekdays = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
	deal_weekdays = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
	is_verified = serializers.BooleanField(required=False, default=False)


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
	has_deals = serializers.BooleanField(required=False, default=False)
	deal_count = serializers.IntegerField(required=False, default=0)
	operating_weekdays = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
	deal_weekdays = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
	is_verified = serializers.BooleanField(required=False, default=False)
	locations = PlaceLocationSerializer(many=True, required=False, default=list)


class PlaceDetailSerializer(PlaceListSerializer):
	deals = DealSerializer(many=True)
	locations = PlaceLocationDetailSerializer(many=True, required=False, default=list)
