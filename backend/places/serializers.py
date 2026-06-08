import json
from urllib.parse import urlparse

from django.contrib.auth.password_validation import validate_password
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils.text import slugify
from rest_framework import serializers

from .models import BusinessClaim, BusinessClaimAttachment, BusinessClaimProfileEntry, BusinessPost, City, FeedEngagement, FeedImpression, ListingSnapshot, SponsoredCampaign, VenueType
from .services.account_profiles import build_account_response, get_or_create_account_profile, has_active_business_membership
from .services.business_profile_overrides import (
	build_deal_payloads,
	build_operating_hour_payloads,
	normalize_deal_overrides,
	normalize_operating_hour_overrides,
	summarize_deal_overrides,
	summarize_operating_hour_overrides,
)
from .services.social_profiles import build_social_media_links, get_business_website_url, normalize_social_profiles


BUSINESS_DOCUMENT_KEYS = (
	'business_registration',
	'health_permit',
	'abc_license',
	'proof_of_address_control',
)

ATTACHMENT_FIELD_NAME_MAP = {
	'social_media_attachments': BusinessClaimAttachment.AttachmentKind.SOCIAL_MEDIA,
	'business_registration_attachments': BusinessClaimAttachment.AttachmentKind.BUSINESS_REGISTRATION,
	'health_permit_attachments': BusinessClaimAttachment.AttachmentKind.HEALTH_PERMIT,
	'abc_license_attachments': BusinessClaimAttachment.AttachmentKind.ABC_LICENSE,
	'proof_of_address_control_attachments': BusinessClaimAttachment.AttachmentKind.PROOF_OF_ADDRESS_CONTROL,
	'proof_of_authority_attachments': BusinessClaimAttachment.AttachmentKind.PROOF_OF_AUTHORITY,
}

PROFILE_ENTRY_FIELD_KIND_MAP = {
	'social_media_links': BusinessClaim.ProfileEntryKind.SOCIAL_MEDIA_LINK,
	'offer_entries': BusinessClaim.ProfileEntryKind.OFFER,
	'hours_of_operation_entries': BusinessClaim.ProfileEntryKind.OPERATING_HOUR,
	'photo_references': BusinessClaim.ProfileEntryKind.PHOTO_REFERENCE,
}

LIST_JSON_FIELD_NAMES = (
	'social_media_links',
	'offer_entries',
	'hours_of_operation_entries',
	'photo_references',
	'deal_overrides',
	'operating_hour_overrides',
)

DICT_JSON_FIELD_NAMES = (
	'verification_documents',
	'social_profiles',
)


def _normalize_social_profile_payload(raw_profiles=None, business_website_url='', social_media_links=None):
	try:
		normalized_social_profiles = normalize_social_profiles(
			raw_profiles,
			fallback_website_url=business_website_url,
			fallback_social_links=social_media_links,
		)
	except ValueError as error:
		raise serializers.ValidationError({'social_profiles': [str(error)]})

	return (
		normalized_social_profiles,
		get_business_website_url(normalized_social_profiles, fallback=business_website_url),
		build_social_media_links(normalized_social_profiles),
	)


def _normalize_business_profile_override_payload(raw_deal_overrides=None, raw_operating_hour_overrides=None):
	try:
		normalized_deal_overrides = normalize_deal_overrides(raw_deal_overrides)
	except ValueError as error:
		raise serializers.ValidationError({'deal_overrides': [str(error)]})

	try:
		normalized_operating_hour_overrides = normalize_operating_hour_overrides(raw_operating_hour_overrides)
	except ValueError as error:
		raise serializers.ValidationError({'operating_hour_overrides': [str(error)]})

	return (
		normalized_deal_overrides,
		normalized_operating_hour_overrides,
		summarize_deal_overrides(normalized_deal_overrides),
		summarize_operating_hour_overrides(normalized_operating_hour_overrides),
	)


def build_signup_request_data(data):
	if hasattr(data, 'lists'):
		normalized = {
			key: values if len(values) > 1 else values[0]
			for key, values in data.lists()
		}
	else:
		normalized = dict(data)

	for key in LIST_JSON_FIELD_NAMES:
		if key not in normalized:
			continue
		value = normalized[key]
		if isinstance(value, list):
			continue
		if isinstance(value, str):
			stripped = value.strip()
			normalized[key] = json.loads(stripped) if stripped else []

	for key in DICT_JSON_FIELD_NAMES:
		if key not in normalized:
			continue
		value = normalized[key]
		if isinstance(value, dict):
			continue
		if isinstance(value, str):
			stripped = value.strip()
			normalized[key] = json.loads(stripped) if stripped else {}

	return normalized


def _normalize_string_list(value):
	if value is None or value == '':
		return []
	if isinstance(value, str):
		items = value.splitlines()
	else:
		items = list(value)
	return [str(item).strip() for item in items if str(item).strip()]


def _normalize_document_map(value):
	if not value:
		return {key: [] for key in BUSINESS_DOCUMENT_KEYS}
	if not isinstance(value, dict):
		raise serializers.ValidationError('Verification documents must be grouped by document type.')
	return {
		key: _normalize_string_list(value.get(key, []))
		for key in BUSINESS_DOCUMENT_KEYS
	}


def _normalize_url_identity(value):
	parsed = urlparse(str(value or '').strip())
	netloc = str(parsed.netloc or '').strip().lower().removeprefix('www.')
	path = str(parsed.path or '').strip().rstrip('/').lower()
	if not netloc and not path:
		return ''
	return f'{netloc}{path}'


def _create_claim_attachments(claim, request):
	if request is None:
		return
	for request_field_name, attachment_kind in ATTACHMENT_FIELD_NAME_MAP.items():
		for uploaded_file in request.FILES.getlist(request_field_name):
			BusinessClaimAttachment.objects.create(
				claim=claim,
				attachment_kind=attachment_kind,
				file=uploaded_file,
				original_filename=uploaded_file.name,
				content_type=getattr(uploaded_file, 'content_type', '') or '',
				file_size=getattr(uploaded_file, 'size', 0) or 0,
			)


def _create_claim_profile_entries(claim, validated_data):
	entry_rows = []
	for field_name, entry_kind in PROFILE_ENTRY_FIELD_KIND_MAP.items():
		for index, value in enumerate(validated_data.get(field_name, [])):
			entry_rows.append(
				BusinessClaimProfileEntry(
					claim=claim,
					entry_kind=entry_kind,
					value=value,
					sort_order=index,
				)
			)
	if entry_rows:
		BusinessClaimProfileEntry.objects.bulk_create(entry_rows)


def _replace_claim_profile_entries(claim, validated_data):
	claim.profile_entries.filter(entry_kind__in=PROFILE_ENTRY_FIELD_KIND_MAP.values()).delete()
	_create_claim_profile_entries(claim, validated_data)


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
	claim_pathway = serializers.CharField(required=False, allow_null=True)
	claim_review_pending = serializers.BooleanField(required=False)
	claim_review_message = serializers.CharField(required=False, allow_blank=True)
	business_name = serializers.CharField(required=False, allow_blank=True)
	email_verified = serializers.BooleanField(required=False)
	email_verification_sent_at = serializers.DateTimeField(required=False, allow_null=True)
	email_verification_required = serializers.BooleanField(required=False)
	verification_code_expires_at = serializers.DateTimeField(required=False, allow_null=True)
	verification_code_ttl_seconds = serializers.IntegerField(required=False)
	two_factor_enabled = serializers.BooleanField(required=False)
	billing_portal_url = serializers.CharField(required=False, allow_blank=True)
	approved_businesses = serializers.ListField(child=serializers.DictField(), required=False)
	sponsored_campaigns = serializers.ListField(child=serializers.DictField(), required=False)
	favorite_businesses = serializers.ListField(child=serializers.DictField(), required=False)
	business_contact = serializers.DictField(required=False)
	can_access_places = serializers.BooleanField(required=False)
	two_factor_pending_setup = serializers.BooleanField(required=False)
	business_location_tracking_available = serializers.BooleanField(required=False)
	business_location_tracking_enabled = serializers.BooleanField(required=False)
	requires_business_location_tracking = serializers.BooleanField(required=False)
	tracked_business_location = serializers.DictField(required=False)


class ProfileDashboardUpdateSerializer(serializers.Serializer):
	username = serializers.CharField(max_length=150)
	email = serializers.EmailField()
	first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
	last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
	contact_name = serializers.CharField(max_length=120, required=False)
	job_title = serializers.CharField(max_length=120, required=False, allow_blank=True)
	work_email = serializers.EmailField(required=False)
	work_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
	employer_address = serializers.CharField(max_length=255, required=False, allow_blank=True)
	business_website_url = serializers.URLField(required=False, allow_blank=True)
	social_profiles = serializers.JSONField(required=False)
	deal_overrides = serializers.JSONField(required=False)
	operating_hour_overrides = serializers.JSONField(required=False)
	social_media_links_text = serializers.CharField(required=False, allow_blank=True)
	offer_entries_text = serializers.CharField(required=False, allow_blank=True)
	hours_of_operation_entries_text = serializers.CharField(required=False, allow_blank=True)
	photo_references_text = serializers.CharField(required=False, allow_blank=True)
	supporting_details = serializers.CharField(max_length=4000, required=False, allow_blank=True)

	def validate_username(self, value):
		normalized = value.strip()
		if not normalized:
			raise serializers.ValidationError('Enter a username.')
		user = self.context['request'].user
		if User.objects.exclude(pk=user.pk).filter(username__iexact=normalized).exists():
			raise serializers.ValidationError('That username is already in use.')
		return normalized

	def validate_email(self, value):
		normalized = value.strip().lower()
		user = self.context['request'].user
		if User.objects.exclude(pk=user.pk).filter(email__iexact=normalized).exists():
			raise serializers.ValidationError('That email address is already in use.')
		return normalized

	def validate_first_name(self, value):
		return value.strip()

	def validate_last_name(self, value):
		return value.strip()

	def validate_contact_name(self, value):
		return value.strip()

	def validate_job_title(self, value):
		return value.strip()

	def validate_work_email(self, value):
		return value.strip().lower()

	def validate_work_phone(self, value):
		return value.strip()

	def validate_employer_address(self, value):
		return value.strip()

	def validate_business_website_url(self, value):
		return value.strip()

	def validate_supporting_details(self, value):
		return value.strip()

	def validate(self, attrs):
		attrs = super().validate(attrs)
		if any(field_name in attrs for field_name in ('social_profiles', 'social_media_links_text', 'business_website_url')):
			legacy_social_links = _normalize_string_list(attrs.get('social_media_links_text', '')) if 'social_media_links_text' in attrs else []
			normalized_social_profiles, normalized_website_url, normalized_social_links = _normalize_social_profile_payload(
				attrs.get('social_profiles', {}),
				business_website_url=attrs.get('business_website_url', ''),
				social_media_links=legacy_social_links,
			)
			attrs['social_profiles'] = normalized_social_profiles
			attrs['business_website_url'] = normalized_website_url
			attrs['social_media_links_text'] = '\n'.join(normalized_social_links)
		if 'deal_overrides' in attrs or 'operating_hour_overrides' in attrs:
			(
				attrs['deal_overrides'],
				attrs['operating_hour_overrides'],
				normalized_offer_entries,
				normalized_hour_entries,
			) = _normalize_business_profile_override_payload(
				attrs.get('deal_overrides', []),
				attrs.get('operating_hour_overrides', []),
			)
			attrs['offer_entries_text'] = '\n'.join(normalized_offer_entries)
			attrs['hours_of_operation_entries_text'] = '\n'.join(normalized_hour_entries)
		return attrs


class BusinessLocationTrackingPreferenceSerializer(serializers.Serializer):
	enabled = serializers.BooleanField()


class ContactSupportSerializer(serializers.Serializer):
	subject = serializers.CharField(max_length=160, required=False, allow_blank=True)
	message = serializers.CharField(max_length=4000)
	portal = serializers.ChoiceField(choices=['customer', 'business'], required=False, allow_blank=True)

	def validate_subject(self, value):
		return value.strip()

	def validate_message(self, value):
		normalized = value.strip()
		if not normalized:
			raise serializers.ValidationError('Enter a message for support.')
		return normalized


class FavoriteBusinessToggleSerializer(serializers.Serializer):
	slug = serializers.SlugField(max_length=170)
	favorited = serializers.BooleanField()
	portal = serializers.ChoiceField(choices=['customer', 'business'], required=False, allow_blank=True)

	def validate_slug(self, value):
		normalized = value.strip()
		if not normalized:
			raise serializers.ValidationError('Select a business to favorite.')
		return normalized


class DeleteAccountSerializer(serializers.Serializer):
	password = serializers.CharField(write_only=True, style={'input_type': 'password'})

	def validate_password(self, value):
		request = self.context.get('request')
		user = getattr(request, 'user', None)
		if user is None or not getattr(user, 'is_authenticated', False) or not user.check_password(value):
			raise serializers.ValidationError('Incorrect password.')
		return value


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

		if attrs['portal'] == 'customer' and has_active_business_membership(authenticated_user):
			raise serializers.ValidationError('Business accounts must sign in through the business account portal.')

		if attrs['portal'] == 'business':
			if has_active_business_membership(authenticated_user):
				pass
			elif authenticated_user.business_claims.exists() or authenticated_user.business_memberships.exists():
				raise serializers.ValidationError('Your business claim must be approved by an admin before you can sign in to the business portal.')
			else:
				raise serializers.ValidationError('That account does not have an approved business profile yet.')

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

	def allows_rejected_business_reregistration(self):
		return False

	def validate_username(self, value):
		return value.strip()

	def validate_email(self, value):
		return value.strip().lower()

	def _get_existing_user_by_username(self, username):
		return User.objects.filter(username__iexact=str(username or '').strip()).first()

	def _get_existing_user_by_email(self, email):
		return User.objects.filter(email__iexact=str(email or '').strip().lower()).first()

	def _can_reuse_existing_business_user(self, user):
		if user is None or not self.allows_rejected_business_reregistration():
			return False
		if user.business_memberships.filter(is_active=True).exists():
			return False
		latest_claim = user.business_claims.order_by('-created_at').first()
		return latest_claim is not None and latest_claim.status == BusinessClaim.Status.REJECTED

	def _can_upgrade_authenticated_existing_user(self, user):
		request = self.context.get('request')
		request_user = getattr(request, 'user', None)
		if user is None or request_user is None or not getattr(request_user, 'is_authenticated', False):
			return False
		if request_user.pk != user.pk:
			return False
		return not user.business_memberships.filter(is_active=True).exists()

	def validate(self, attrs):
		attrs = super().validate(attrs)
		existing_username_user = self._get_existing_user_by_username(attrs.get('username'))
		existing_email_user = self._get_existing_user_by_email(attrs.get('email'))

		if existing_username_user and existing_email_user and existing_username_user.pk != existing_email_user.pk:
			raise serializers.ValidationError({
				'username': ['That username is already in use.'],
				'email': ['That email is already in use.'],
			})

		existing_user = existing_username_user or existing_email_user
		if existing_user is None:
			return attrs

		if self._can_upgrade_authenticated_existing_user(existing_user):
			attrs['_signup_existing_user'] = existing_user
			return attrs

		if self._can_reuse_existing_business_user(existing_user):
			attrs['_signup_existing_user'] = existing_user
			return attrs

		errors = {}
		if existing_username_user is not None:
			errors['username'] = ['That username is already in use.']
		if existing_email_user is not None:
			errors['email'] = ['That email is already in use.']
		raise serializers.ValidationError(errors)

	def create_or_reuse_user(self, validated_data):
		password = validated_data.pop('password')
		existing_user = validated_data.pop('_signup_existing_user', None)
		if existing_user is None:
			user = User.objects.create_user(password=password, **validated_data)
			user._signup_reused_existing_user = False
			return user

		for field_name, value in validated_data.items():
			setattr(existing_user, field_name, value)
		existing_user.set_password(password)
		existing_user.save(update_fields=['username', 'email', 'first_name', 'last_name', 'password'])
		existing_user._signup_reused_existing_user = True
		return existing_user

	def create(self, validated_data):
		user = self.create_or_reuse_user(validated_data)
		get_or_create_account_profile(user)
		return user


class ClaimedBusinessSignupSerializer(CustomerSignupSerializer):
	business_slug = serializers.SlugField(write_only=True)
	contact_name = serializers.CharField(max_length=120)
	job_title = serializers.ChoiceField(choices=BusinessClaim.JobTitle.choices)
	work_email = serializers.EmailField()
	work_phone = serializers.CharField(max_length=20)
	employer_address = serializers.CharField(max_length=255)
	address_not_applicable = serializers.BooleanField(default=False)
	business_website_url = serializers.URLField(required=False, allow_blank=True)
	social_profiles = serializers.JSONField(required=False)
	deal_overrides = serializers.JSONField(required=False)
	operating_hour_overrides = serializers.JSONField(required=False)
	social_media_links = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	offer_entries = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	hours_of_operation_entries = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	photo_references = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	verification_documents = serializers.JSONField(required=False)
	supporting_details = serializers.CharField(max_length=4000, required=False, allow_blank=True)

	def allows_rejected_business_reregistration(self):
		return True

	def validate(self, attrs):
		attrs = super().validate(attrs)
		if attrs.get('address_not_applicable'):
			raise serializers.ValidationError({'address_not_applicable': ['Address Not Applicable is only available when you create a new business profile.']})
		attrs['social_media_links'] = _normalize_string_list(attrs.get('social_media_links', []))
		attrs['social_profiles'], attrs['business_website_url'], attrs['social_media_links'] = _normalize_social_profile_payload(
			attrs.get('social_profiles', {}),
			business_website_url=attrs.get('business_website_url', ''),
			social_media_links=attrs['social_media_links'],
		)
		if 'deal_overrides' in attrs or 'operating_hour_overrides' in attrs:
			attrs['deal_overrides'], attrs['operating_hour_overrides'], attrs['offer_entries'], attrs['hours_of_operation_entries'] = _normalize_business_profile_override_payload(
				attrs.get('deal_overrides', []),
				attrs.get('operating_hour_overrides', []),
			)
		else:
			attrs['offer_entries'] = _normalize_string_list(attrs.get('offer_entries', []))
			attrs['hours_of_operation_entries'] = _normalize_string_list(attrs.get('hours_of_operation_entries', []))
		attrs['photo_references'] = _normalize_string_list(attrs.get('photo_references', []))
		attrs['verification_documents'] = _normalize_document_map(attrs.get('verification_documents', {}))
		return attrs

	def create(self, validated_data):
		listing_snapshot = validated_data.pop('listing_snapshot')
		validated_data.pop('business_slug', None)
		listing_snapshot.website_url = validated_data.pop('business_website_url', '') or listing_snapshot.website_url
		listing_snapshot.save(update_fields=['website_url', 'updated_at'])
		claim_data = {
			'pathway': BusinessClaim.Pathway.CLAIMED,
			'contact_name': validated_data.pop('contact_name'),
			'job_title': validated_data.pop('job_title'),
			'work_email': validated_data.pop('work_email'),
			'work_phone': validated_data.pop('work_phone'),
			'employer_address': validated_data.pop('employer_address'),
			'address_not_applicable': validated_data.pop('address_not_applicable', False),
			'business_website_url': listing_snapshot.website_url,
			'social_profiles': validated_data.pop('social_profiles', {}),
			'social_media_links': validated_data.pop('social_media_links', []),
			'deal_overrides': validated_data.pop('deal_overrides', None),
			'operating_hour_overrides': validated_data.pop('operating_hour_overrides', None),
			'offer_entries': validated_data.pop('offer_entries', []),
			'hours_of_operation_entries': validated_data.pop('hours_of_operation_entries', []),
			'photo_references': validated_data.pop('photo_references', []),
			'verification_documents': validated_data.pop('verification_documents', {}),
			'verification_summary': 'Submitted through the claimed business verification flow.',
			'supporting_details': validated_data.pop('supporting_details', ''),
		}
		request = self.context.get('request')

		with transaction.atomic():
			user = self.create_or_reuse_user(validated_data)
			claim = BusinessClaim.objects.create(
				claimant=user,
				listing_snapshot=listing_snapshot,
				status=BusinessClaim.Status.DRAFT,
				**claim_data,
			)
			_create_claim_profile_entries(claim, claim_data)
			_create_claim_attachments(claim, request)
			try:
				claim.submit_for_review()
			except DjangoValidationError as error:
				raise serializers.ValidationError(list(error.messages))
			user._created_business_claim = claim
			return user


class EstablishedBusinessSignupSerializer(CustomerSignupSerializer):
	business_name = serializers.CharField(max_length=150)
	business_city = serializers.CharField(max_length=40)
	business_venue_type = serializers.ChoiceField(choices=VenueType.choices)
	business_website_url = serializers.URLField()
	contact_name = serializers.CharField(max_length=120)
	job_title = serializers.ChoiceField(choices=BusinessClaim.JobTitle.choices)
	work_email = serializers.EmailField()
	work_phone = serializers.CharField(max_length=20)
	employer_address = serializers.CharField(max_length=255, required=False, allow_blank=True)
	address_not_applicable = serializers.BooleanField(default=False)
	social_profiles = serializers.JSONField(required=False)
	deal_overrides = serializers.JSONField(required=False)
	operating_hour_overrides = serializers.JSONField(required=False)
	social_media_links = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	offer_entries = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	hours_of_operation_entries = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	photo_references = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	verification_documents = serializers.JSONField(required=False)
	supporting_details = serializers.CharField(max_length=4000, required=False, allow_blank=True)

	def allows_rejected_business_reregistration(self):
		return True

	def validate_business_city(self, value):
		normalized = str(value or '').strip().lower()
		if normalized in City.values or normalized == BusinessClaim.MULTIPLE_AREAS_VALUE:
			return normalized
		raise serializers.ValidationError('Select a supported city or Serves Multiple Locations / Service Area Business.')

	def validate(self, attrs):
		attrs = super().validate(attrs)
		serves_multiple_areas = attrs.get('business_city') == BusinessClaim.MULTIPLE_AREAS_VALUE
		attrs['serves_multiple_areas'] = serves_multiple_areas
		if serves_multiple_areas and not attrs.get('employer_address'):
			attrs['address_not_applicable'] = True
		if serves_multiple_areas:
			attrs['business_city'] = ''
		if not attrs.get('address_not_applicable') and not attrs.get('employer_address'):
			raise serializers.ValidationError({'employer_address': ['Employer address is required unless you mark Address Not Applicable.']})
		attrs['social_media_links'] = _normalize_string_list(attrs.get('social_media_links', []))
		attrs['social_profiles'], attrs['business_website_url'], attrs['social_media_links'] = _normalize_social_profile_payload(
			attrs.get('social_profiles', {}),
			business_website_url=attrs.get('business_website_url', ''),
			social_media_links=attrs['social_media_links'],
		)
		if 'deal_overrides' in attrs or 'operating_hour_overrides' in attrs:
			attrs['deal_overrides'], attrs['operating_hour_overrides'], attrs['offer_entries'], attrs['hours_of_operation_entries'] = _normalize_business_profile_override_payload(
				attrs.get('deal_overrides', []),
				attrs.get('operating_hour_overrides', []),
			)
		else:
			attrs['offer_entries'] = _normalize_string_list(attrs.get('offer_entries', []))
			attrs['hours_of_operation_entries'] = _normalize_string_list(attrs.get('hours_of_operation_entries', []))
		attrs['photo_references'] = _normalize_string_list(attrs.get('photo_references', []))
		attrs['verification_documents'] = _normalize_document_map(attrs.get('verification_documents', {}))
		return attrs

	def create(self, validated_data):
		business_venue_type = validated_data.pop('business_venue_type')
		serves_multiple_areas = validated_data.pop('serves_multiple_areas', False)
		listing_address = validated_data.get('employer_address') or ('Approximate live location' if serves_multiple_areas else 'Address Not Applicable')
		listing_snapshot = ListingSnapshot.objects.create(
			name=validated_data.pop('business_name'),
			city=validated_data.pop('business_city', ''),
			venue_type=business_venue_type,
			address_line_1=listing_address,
			serves_multiple_areas=serves_multiple_areas,
			website_url=validated_data.pop('business_website_url', ''),
			source_name=BusinessClaim.MANUAL_SOURCE_NAME,
			external_id=f'manual-{slugify(validated_data.get("username", "business"))}',
		)

		claim_data = {
			'pathway': BusinessClaim.Pathway.ESTABLISHED,
			'contact_name': validated_data.pop('contact_name'),
			'job_title': validated_data.pop('job_title'),
			'work_email': validated_data.pop('work_email'),
			'work_phone': validated_data.pop('work_phone'),
			'employer_address': validated_data.pop('employer_address', ''),
			'address_not_applicable': validated_data.pop('address_not_applicable', False),
			'serves_multiple_areas': serves_multiple_areas,
			'business_website_url': listing_snapshot.website_url,
			'social_profiles': validated_data.pop('social_profiles', {}),
			'social_media_links': validated_data.pop('social_media_links', []),
			'deal_overrides': validated_data.pop('deal_overrides', None),
			'operating_hour_overrides': validated_data.pop('operating_hour_overrides', None),
			'offer_entries': validated_data.pop('offer_entries', []),
			'hours_of_operation_entries': validated_data.pop('hours_of_operation_entries', []),
			'photo_references': validated_data.pop('photo_references', []),
			'verification_documents': validated_data.pop('verification_documents', {}),
			'verification_summary': 'Submitted through the established business creation flow.',
			'supporting_details': validated_data.pop('supporting_details', ''),
		}
		request = self.context.get('request')
		with transaction.atomic():
			user = self.create_or_reuse_user(validated_data)
			claim = BusinessClaim.objects.create(
				claimant=user,
				listing_snapshot=listing_snapshot,
				status=BusinessClaim.Status.DRAFT,
				**claim_data,
			)
			_create_claim_profile_entries(claim, claim_data)
			_create_claim_attachments(claim, request)
			try:
				claim.submit_for_review()
			except DjangoValidationError as error:
				raise serializers.ValidationError(list(error.messages))
			user._created_business_claim = claim
			return user


class InformalBusinessSignupSerializer(CustomerSignupSerializer):
	business_name = serializers.CharField(max_length=150)
	business_city = serializers.CharField(max_length=40)
	business_venue_type = serializers.ChoiceField(choices=VenueType.choices)
	business_website_url = serializers.URLField(required=False, allow_blank=True)
	social_profiles = serializers.JSONField(required=False)
	deal_overrides = serializers.JSONField(required=False)
	operating_hour_overrides = serializers.JSONField(required=False)
	social_media_links = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	offer_entries = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	hours_of_operation_entries = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	photo_references = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	supporting_details = serializers.CharField(max_length=4000, required=False, allow_blank=True)

	def allows_rejected_business_reregistration(self):
		return True

	def validate_business_city(self, value):
		normalized = str(value or '').strip().lower()
		if normalized in City.values or normalized == BusinessClaim.MULTIPLE_AREAS_VALUE:
			return normalized
		raise serializers.ValidationError('Select a supported city or Serves Multiple Locations / Service Area Business.')

	def validate(self, attrs):
		attrs = super().validate(attrs)
		attrs['serves_multiple_areas'] = attrs.get('business_city') == BusinessClaim.MULTIPLE_AREAS_VALUE
		if attrs['serves_multiple_areas']:
			attrs['business_city'] = ''
		attrs['social_media_links'] = _normalize_string_list(attrs.get('social_media_links', []))
		attrs['social_profiles'], attrs['business_website_url'], attrs['social_media_links'] = _normalize_social_profile_payload(
			attrs.get('social_profiles', {}),
			business_website_url=attrs.get('business_website_url', ''),
			social_media_links=attrs['social_media_links'],
		)
		if 'deal_overrides' in attrs or 'operating_hour_overrides' in attrs:
			attrs['deal_overrides'], attrs['operating_hour_overrides'], attrs['offer_entries'], attrs['hours_of_operation_entries'] = _normalize_business_profile_override_payload(
				attrs.get('deal_overrides', []),
				attrs.get('operating_hour_overrides', []),
			)
		else:
			attrs['offer_entries'] = _normalize_string_list(attrs.get('offer_entries', []))
			attrs['hours_of_operation_entries'] = _normalize_string_list(attrs.get('hours_of_operation_entries', []))
		attrs['photo_references'] = _normalize_string_list(attrs.get('photo_references', []))
		return attrs

	def create(self, validated_data):
		serves_multiple_areas = validated_data.pop('serves_multiple_areas', False)
		social_media_links = validated_data.pop('social_media_links', [])
		social_profiles = validated_data.pop('social_profiles', {})
		deal_overrides = validated_data.pop('deal_overrides', None)
		operating_hour_overrides = validated_data.pop('operating_hour_overrides', None)
		offer_entries = validated_data.pop('offer_entries', [])
		hours_of_operation_entries = validated_data.pop('hours_of_operation_entries', [])
		photo_references = validated_data.pop('photo_references', [])
		supporting_details = validated_data.pop('supporting_details', '')
		listing_snapshot = ListingSnapshot.objects.create(
			name=validated_data.pop('business_name'),
			city=validated_data.pop('business_city', ''),
			venue_type=validated_data.pop('business_venue_type'),
			address_line_1='Approximate live location' if serves_multiple_areas else 'Address not yet provided',
			serves_multiple_areas=serves_multiple_areas,
			website_url=validated_data.pop('business_website_url', ''),
			source_name=BusinessClaim.MANUAL_SOURCE_NAME,
			external_id=f'informal-{slugify(validated_data.get("username", "business"))}',
		)

		request = self.context.get('request')
		with transaction.atomic():
			user = self.create_or_reuse_user(validated_data)
			claim = BusinessClaim.objects.create(
				claimant=user,
				listing_snapshot=listing_snapshot,
				pathway=BusinessClaim.Pathway.INFORMAL,
				status=BusinessClaim.Status.DRAFT,
				contact_name=' '.join(part for part in [user.first_name, user.last_name] if part).strip() or user.username,
				work_email=user.email,
				address_not_applicable=serves_multiple_areas,
				serves_multiple_areas=serves_multiple_areas,
				business_website_url=listing_snapshot.website_url,
				social_profiles=social_profiles,
				social_media_links=social_media_links,
				deal_overrides=deal_overrides,
				operating_hour_overrides=operating_hour_overrides,
				offer_entries=offer_entries,
				hours_of_operation_entries=hours_of_operation_entries,
				photo_references=photo_references,
				verification_summary='Submitted through the small startup and vendor flow.',
				supporting_details=supporting_details,
			)
			_create_claim_profile_entries(
				claim,
				{
					'social_media_links': social_media_links,
					'offer_entries': offer_entries,
					'hours_of_operation_entries': hours_of_operation_entries,
					'photo_references': photo_references,
				},
			)
			_create_claim_attachments(claim, request)
			try:
				claim.submit_for_review()
			except DjangoValidationError as error:
				raise serializers.ValidationError(list(error.messages))
			user._created_business_claim = claim
			return user


ManualBusinessSignupSerializer = EstablishedBusinessSignupSerializer


class BusinessLocationUpdateSerializer(serializers.Serializer):
	latitude = serializers.FloatField(min_value=-90, max_value=90)
	longitude = serializers.FloatField(min_value=-180, max_value=180)
	accuracy_meters = serializers.FloatField(required=False, allow_null=True, min_value=0)


def sync_listing_snapshot_from_place_payload(payload):
	primary_location = (payload.get('locations') or [payload])[0]
	city = str(primary_location.get('city') or payload.get('city') or '').strip().lower()
	venue_type = str(primary_location.get('venue_type') or payload.get('venue_type') or '').strip().lower()
	listing_slug = str(payload.get('slug', '') or '').strip()
	website_url = primary_location.get('website_url', '') or payload.get('website_url', '')
	address_line_1 = primary_location.get('address_line_1', '') or payload.get('address_line_1', '')

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
		'website_url': website_url,
		'source_name': 'business_websites',
		'source_url': website_url,
		'external_id': listing_slug,
		'listing_slug': listing_slug,
	}

	snapshot = None
	if listing_slug:
		snapshot = ListingSnapshot.objects.filter(listing_slug=listing_slug).order_by('-updated_at', '-captured_at').first()

	if snapshot is None:
		candidate_queryset = ListingSnapshot.objects.filter(name__iexact=defaults['name'])
		if defaults['city']:
			candidate_queryset = candidate_queryset.filter(city=defaults['city'])
		website_identity = _normalize_url_identity(website_url)
		for candidate in candidate_queryset.order_by('-updated_at', '-captured_at'):
			if website_identity and _normalize_url_identity(candidate.website_url) == website_identity:
				snapshot = candidate
				break
			if address_line_1 and str(candidate.address_line_1 or '').strip().lower() == str(address_line_1).strip().lower():
				snapshot = candidate
				break

	if snapshot is not None:
		for field_name, value in defaults.items():
			setattr(snapshot, field_name, value)
		snapshot.save(update_fields=[
			'name',
			'city',
			'venue_type',
			'address_line_1',
			'address_line_2',
			'neighborhood',
			'state',
			'postal_code',
			'phone_number',
			'website_url',
			'source_name',
			'source_url',
			'external_id',
			'listing_slug',
			'updated_at',
		])
		return snapshot

	snapshot, _ = ListingSnapshot.objects.update_or_create(
		listing_slug=listing_slug,
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


class FeedItemSerializer(serializers.Serializer):
	id = serializers.CharField()
	item_type = serializers.CharField()
	is_sponsored = serializers.BooleanField()
	post_id = serializers.IntegerField()
	campaign_id = serializers.IntegerField(required=False, allow_null=True)
	business_name = serializers.CharField()
	business_slug = serializers.CharField()
	city = serializers.CharField(allow_blank=True)
	city_label = serializers.CharField(allow_blank=True)
	venue_type = serializers.CharField(allow_blank=True)
	venue_type_label = serializers.CharField(allow_blank=True)
	title = serializers.CharField()
	summary = serializers.CharField(allow_blank=True)
	body = serializers.CharField(allow_blank=True)
	hero_image_url = serializers.CharField(allow_blank=True)
	cta_label = serializers.CharField(allow_blank=True)
	cta_url = serializers.CharField(allow_blank=True)
	published_at = serializers.DateTimeField(allow_null=True)
	starts_at = serializers.DateTimeField(allow_null=True)
	ends_at = serializers.DateTimeField(allow_null=True)
	sponsor_label = serializers.CharField(allow_blank=True)


class FeedImpressionWriteSerializer(serializers.ModelSerializer):
	class Meta:
		model = FeedImpression
		fields = ['feed_item_id', 'post', 'campaign', 'placement_type', 'session_key', 'request_id', 'page_number', 'position']

	def validate(self, attrs):
		campaign = attrs.get('campaign')
		post = attrs.get('post')
		placement_type = attrs.get('placement_type')
		if campaign is not None and campaign.post_id != post.id:
			raise serializers.ValidationError('Campaign and post must refer to the same promoted content.')
		if placement_type == FeedImpression.PlacementType.SPONSORED and campaign is None:
			raise serializers.ValidationError('Sponsored impressions require a campaign.')
		if placement_type == FeedImpression.PlacementType.ORGANIC and campaign is not None:
			raise serializers.ValidationError('Organic impressions cannot attach a campaign.')
		return attrs


class FeedEngagementWriteSerializer(serializers.ModelSerializer):
	class Meta:
		model = FeedEngagement
		fields = ['feed_item_id', 'post', 'campaign', 'impression', 'event_type', 'session_key', 'destination_url', 'page_number', 'position']

	def validate(self, attrs):
		campaign = attrs.get('campaign')
		post = attrs.get('post')
		impression = attrs.get('impression')
		if campaign is not None and campaign.post_id != post.id:
			raise serializers.ValidationError('Campaign and post must refer to the same promoted content.')
		if impression is not None:
			if impression.post_id != post.id:
				raise serializers.ValidationError('Impression and post must refer to the same content.')
			if campaign is not None and impression.campaign_id != campaign.id:
				raise serializers.ValidationError('Impression and campaign must refer to the same promoted content.')
		return attrs


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
	is_claimed = serializers.BooleanField(required=False, default=False)
	is_informal = serializers.BooleanField(required=False, default=False)
	social_profiles = serializers.DictField(required=False, default=dict)
	deal_overrides = serializers.ListField(child=serializers.DictField(), required=False, allow_null=True)
	operating_hour_overrides = serializers.ListField(child=serializers.DictField(), required=False, allow_null=True)
	social_media_links = serializers.ListField(child=serializers.CharField(), required=False, default=list)
	offer_entries = serializers.ListField(child=serializers.CharField(), required=False, default=list)
	hours_of_operation_entries = serializers.ListField(child=serializers.CharField(), required=False, default=list)
	photo_references = serializers.ListField(child=serializers.CharField(), required=False, default=list)
	supporting_details = serializers.CharField(required=False, allow_blank=True, default='')
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
