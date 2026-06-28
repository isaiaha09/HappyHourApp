from django.conf import settings
from django.contrib.auth.models import User
from django.core.files.storage import default_storage
from django.http import Http404, HttpResponse
from django.utils.text import slugify
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework import generics, status
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView
from pathlib import Path
from uuid import uuid4

from .authentication import ProfileTokenAuthentication
from .serializers import (
	BusinessLocationTrackingPreferenceSerializer,
	BusinessLocationUpdateSerializer,
	ClaimedBusinessSignupSerializer,
	ContactSupportSerializer,
	CustomerSignupSerializer,
	DeleteAccountSerializer,
	DealSerializer,
	DirectMessageBlockSerializer,
	DirectMessageItemSerializer,
	DirectMessageSendSerializer,
	DirectMessageThreadListSerializer,
	EmailVerificationCodeSerializer,
	FeedEngagementWriteSerializer,
	FeedImpressionWriteSerializer,
	FeedItemSerializer,
	FavoriteBusinessToggleSerializer,
	InformalBusinessSignupSerializer,
	LoginSerializer,
	PasswordResetConfirmSerializer,
	PasswordResetRequestSerializer,
	PushDeviceRegistrationSerializer,
	ProfileDashboardUpdateSerializer,
	ManualBusinessSignupSerializer,
	PlaceDetailSerializer,
	PlaceListSerializer,
	ResendEmailVerificationCodeSerializer,
	TwoFactorCodeSerializer,
	UsernameReminderSerializer,
	_replace_claim_profile_entries,
	merge_uploaded_deal_attachments,
	_normalize_string_list,
	build_signup_request_data,
	sync_listing_snapshot_from_place_payload,
)
from .services.account_profiles import build_account_response, build_email_verification_challenge, get_business_access_hold_claim, get_or_create_account_profile, get_or_create_profile_token, infer_portal_for_user, send_business_claim_received_email, send_password_reset_email, send_support_contact_email, send_username_reminder_email, send_verification_email
from .models import BusinessDirectMessage, BusinessDirectMessageBlock, BusinessDirectMessageThread, BusinessMembership, FavoriteBusiness, FavoriteBusinessNotification, FavoriteBusinessPushDevice, FeedImpression, VenueType
from .services.favorite_notifications import create_notifications_for_business_profile_update
from .services.direct_message_push import send_push_notifications_for_direct_message
from .services.home_feed import get_feed_interval, get_feed_queryset, get_organic_page_size, get_ranked_campaigns, get_requested_feed_page_size, mix_feed_items, record_campaign_served
from .services.social_profiles import build_social_media_links, get_business_website_url, normalize_social_profiles
from .services.source_listings import get_source_deal_payloads, get_source_place_payload, get_source_place_payloads, load_source_records


class SourcePlacePagination(PageNumberPagination):
	page_size = 100
	page_size_query_param = 'page_size'
	max_page_size = 500


class HomeFeedPagination(PageNumberPagination):
	page_size = 12
	page_size_query_param = 'page_size'
	max_page_size = 30


SUPPORTED_PROFILE_PHOTO_SUFFIXES = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic', '.heif'}


def _save_uploaded_profile_photo_urls(request, claim):
	photo_urls = []
	for uploaded_file in request.FILES.getlist('profile_photo_uploads'):
		content_type = str(getattr(uploaded_file, 'content_type', '') or '').strip().lower()
		file_suffix = Path(getattr(uploaded_file, 'name', '') or '').suffix.lower()
		if not (content_type.startswith('image/') or file_suffix in SUPPORTED_PROFILE_PHOTO_SUFFIXES):
			raise ValueError('Only image uploads from your photo library are supported.')

		filename_root = Path(getattr(uploaded_file, 'name', '') or 'business-photo').stem or 'business-photo'
		safe_name = slugify(filename_root) or 'business-photo'
		saved_name = default_storage.save(
			f'business-profile-photos/{claim.id}/{uuid4().hex}-{safe_name}{file_suffix}',
			uploaded_file,
		)
		photo_urls.append(request.build_absolute_uri(default_storage.url(saved_name)))

	return photo_urls


def _append_uploaded_profile_photos_to_claim(request, claim):
	if request is None or claim is None:
		return

	uploaded_photo_urls = _save_uploaded_profile_photo_urls(request, claim)
	if not uploaded_photo_urls:
		return

	claim.photo_references = _normalize_string_list([*claim.photo_references, *uploaded_photo_urls])
	claim.photo_gallery_overridden = True
	claim.save(update_fields=['photo_references', 'photo_gallery_overridden', 'updated_at'])
	_replace_claim_profile_entries(
		claim,
		{
			'social_media_links': claim.social_media_links,
			'offer_entries': claim.offer_entries,
			'hours_of_operation_entries': claim.hours_of_operation_entries,
			'photo_references': claim.photo_references,
		},
	)


def _get_active_business_claim_by_slug(listing_slug):
	if not listing_slug:
		return None
	membership = (
		BusinessMembership.objects
		.select_related('claim__listing_snapshot', 'user')
		.filter(is_active=True, claim__listing_snapshot__listing_slug=listing_slug)
		.first()
	)
	if membership is None:
		return None
	return membership.claim


def _can_customer_direct_message_claim(user, claim):
	if user is None or not getattr(user, 'is_authenticated', False):
		return False, False
	portal = infer_portal_for_user(user, 'customer')
	if portal != 'customer':
		return False, False
	if not claim.direct_messaging_enabled:
		return False, False
	is_blocked = claim.direct_message_blocks.filter(customer=user).exists()
	return (not is_blocked), is_blocked


def _apply_direct_message_access(payload, user=None):
	is_claimed = bool(payload.get('is_claimed'))
	claim = _get_active_business_claim_by_slug(payload.get('slug')) if is_claimed else None
	direct_messaging_enabled = bool(claim.direct_messaging_enabled) if claim is not None else bool(payload.get('direct_messaging_enabled', False))
	can_direct_message = False
	direct_message_restricted = False
	if claim is not None:
		can_direct_message, direct_message_restricted = _can_customer_direct_message_claim(user, claim)

	payload['direct_messaging_enabled'] = direct_messaging_enabled
	payload['direct_message_restricted'] = direct_message_restricted
	payload['can_direct_message'] = can_direct_message
	return payload


def _build_direct_message_thread_payload(thread, user):
	last_message = thread.messages.select_related('sender').order_by('-created_at', '-id').first()
	unread_query = thread.messages.exclude(sender_id=user.id).filter(read_at__isnull=True)
	if last_message is not None and last_message.image:
		last_message_preview = 'Sent a photo'
	elif last_message is not None:
		last_message_preview = last_message.body[:160]
	else:
		last_message_preview = ''
	return {
		'id': thread.id,
		'business_slug': thread.business_claim.listing_snapshot.listing_slug,
		'business_name': thread.business_claim.listing_snapshot.name,
		'customer_username': thread.customer.username,
		'last_message_at': thread.last_message_at,
		'last_message_preview': last_message_preview,
		'unread_count': unread_query.count(),
	}


def _customer_can_access_direct_message_thread(user, thread):
	if thread is None:
		return False
	can_direct_message, _ = _can_customer_direct_message_claim(user, thread.business_claim)
	return can_direct_message


def _build_direct_message_item_payload(message, request=None):
	image_url = ''
	if message.image:
		try:
			image_url = message.image.url
		except ValueError:
			image_url = ''
	if image_url and request is not None and image_url.startswith('/'):
		image_url = request.build_absolute_uri(image_url)
	return {
		'id': message.id,
		'sender_id': message.sender_id,
		'sender_username': message.sender.username,
		'message': message.body,
		'message_type': 'image' if message.image else 'text',
		'image_url': image_url,
		'created_at': message.created_at,
		'read_at': message.read_at,
	}


class HealthCheckView(APIView):
	def get(self, request):
		return Response({'status': 'ok', 'service': 'happyhour-backend'})


class DiscoveryEnrichmentStatusView(APIView):
	def get(self, request):
		limit = self._parse_limit(request.query_params.get('limit'))
		records = list(load_source_records())
		discovery_records = [record for record in records if record.source_name != 'business_websites']
		discovery_with_deals = [record for record in discovery_records if any(deal.is_active for deal in record.deals)]
		discovery_without_deals = [record for record in discovery_records if not any(deal.is_active for deal in record.deals)]

		return Response({
			'total_records': len(records),
			'curated_records': len(records) - len(discovery_records),
			'discovery_records': len(discovery_records),
			'discovery_with_deals': len(discovery_with_deals),
			'discovery_without_deals': len(discovery_without_deals),
			'sample_discovery_with_deals': [self._build_record_summary(record) for record in discovery_with_deals[:limit]],
			'sample_discovery_without_deals': [self._build_record_summary(record) for record in discovery_without_deals[:limit]],
		})

	def _parse_limit(self, value):
		try:
			limit = int(value) if value is not None else 10
		except (TypeError, ValueError):
			return 10
		return max(1, min(limit, 50))

	def _build_record_summary(self, record):
		return {
			'name': record.name,
			'city': record.city,
			'source_name': record.source_name,
			'deal_count': sum(1 for deal in record.deals if deal.is_active),
			'website_url': record.website_url,
		}


class PlaceListView(generics.GenericAPIView):
	serializer_class = PlaceListSerializer
	pagination_class = SourcePlacePagination

	def get(self, request):
		city = self.request.query_params.get('city')
		venue_type = self.request.query_params.get('venue_type')
		has_deals = self._parse_has_deals_param(self.request.query_params.get('has_deals'))
		payloads = get_source_place_payloads(
			city=city,
			venue_type=venue_type,
			has_deals=has_deals,
			resolve_missing_coordinates=True,
		)

		page = self.paginate_queryset(payloads)
		if page is not None:
			serializer = self.get_serializer(page, many=True)
			return self.get_paginated_response(serializer.data)

		serializer = self.get_serializer(payloads, many=True)
		return Response(serializer.data)

	def _parse_has_deals_param(self, value):
		if value is None:
			return None
		normalized = str(value).strip().lower()
		if normalized in {'1', 'true', 'yes'}:
			return True
		if normalized in {'0', 'false', 'no'}:
			return False
		return None


class PlaceDetailView(generics.GenericAPIView):
	serializer_class = PlaceDetailSerializer
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = []

	def get(self, request, slug):
		payload = get_source_place_payload(slug)
		if payload is None:
			raise Http404('Place not found.')
		_apply_direct_message_access(payload, user=request.user)

		serializer = self.get_serializer(payload)
		return Response(serializer.data)


class DealListView(generics.GenericAPIView):
	serializer_class = DealSerializer

	def get(self, request):
		city = self.request.query_params.get('city')
		deal_type = self.request.query_params.get('deal_type')
		payloads = get_source_deal_payloads(city=city, deal_type=deal_type)

		page = self.paginate_queryset(payloads)
		if page is not None:
			serializer = self.get_serializer(page, many=True)
			return self.get_paginated_response(serializer.data)

		serializer = self.get_serializer(payloads, many=True)
		return Response(serializer.data)


class HomeFeedView(generics.GenericAPIView):
	serializer_class = FeedItemSerializer
	pagination_class = HomeFeedPagination

	def get(self, request):
		page_number = self._parse_page_number(request.query_params.get('page'))
		requested_page_size = get_requested_feed_page_size(request.query_params.get('page_size'))
		interval = get_feed_interval(page_number)
		organic_page_size = get_organic_page_size(requested_page_size, interval)
		city = str(request.query_params.get('city') or '').strip().lower() or None
		venue_type = str(request.query_params.get('venue_type') or '').strip().lower() or None
		content_types = self._parse_content_types(request.query_params.get('types'))

		paginator = self.paginator
		paginator.page_size = organic_page_size
		queryset = get_feed_queryset(city=city, content_types=content_types)
		page = self.paginate_queryset(queryset)
		campaigns = get_ranked_campaigns(city=city, venue_type=venue_type)
		feed_items = mix_feed_items(posts=page or [], campaigns=campaigns, page_number=page_number, mixed_page_size=requested_page_size)
		serializer = self.get_serializer(feed_items, many=True)
		return self.get_paginated_response(serializer.data)

	def _parse_page_number(self, value):
		try:
			page_number = int(value) if value is not None else 1
		except (TypeError, ValueError):
			return 1
		return max(page_number, 1)

	def _parse_content_types(self, value):
		if not value:
			return []
		return [item.strip().lower() for item in str(value).split(',') if item.strip()]


class FeedImpressionView(generics.GenericAPIView):
	serializer_class = FeedImpressionWriteSerializer

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		impression = serializer.save()
		if impression.campaign_id:
			record_campaign_served(impression.campaign)
		return Response({'id': impression.id}, status=status.HTTP_201_CREATED)


class FeedEngagementView(generics.GenericAPIView):
	serializer_class = FeedEngagementWriteSerializer

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		engagement = serializer.save()
		return Response({'id': engagement.id}, status=status.HTTP_201_CREATED)


class CustomerSignupView(generics.GenericAPIView):
	serializer_class = CustomerSignupSerializer

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		user = serializer.save()
		return Response(build_email_verification_challenge(user, 'customer'), status=status.HTTP_201_CREATED)


class LoginView(generics.GenericAPIView):
	serializer_class = LoginSerializer

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		user = serializer.validated_data['user']
		portal = infer_portal_for_user(user, serializer.validated_data.get('portal'))
		if serializer.validated_data.get('email_verification_required'):
			return Response(build_email_verification_challenge(user, portal))
		hold_claim = get_business_access_hold_claim(user, portal)
		if hold_claim is not None:
			payload = build_account_response(user, portal, claim=hold_claim, token=None)
			payload['detail'] = payload.get('claim_review_message') or ''
			return Response(payload)
		token = get_or_create_profile_token(user)
		return Response(build_account_response(user, portal, token=token))


class UsernameReminderView(generics.GenericAPIView):
	serializer_class = UsernameReminderSerializer

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		user = User.objects.filter(email__iexact=serializer.validated_data['email']).first()
		if user is not None and user.email:
			send_username_reminder_email(user)
		return Response({'detail': 'If that email address is registered, a username reminder has been sent.'})


class PasswordResetRequestView(generics.GenericAPIView):
	serializer_class = PasswordResetRequestSerializer

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		user = self._find_user(serializer.validated_data['identifier'])
		if user is not None and user.email:
			profile = get_or_create_account_profile(user)
			send_password_reset_email(user, profile)
		return Response({'detail': 'If that account exists, a password reset link has been sent.'})

	def _find_user(self, identifier):
		normalized = str(identifier or '').strip()
		user = User.objects.filter(username__iexact=normalized).first()
		if user is None:
			user = User.objects.filter(email__iexact=normalized.lower()).first()
		return user


class BusinessSignupView(generics.GenericAPIView):
	serializer_class = ClaimedBusinessSignupSerializer
	parser_classes = [MultiPartParser, FormParser, JSONParser]
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = []

	def post(self, request):
		payload = build_signup_request_data(request.data)
		business_slug = payload.get('business_slug')
		place_payload = get_source_place_payload(business_slug)
		if place_payload is None:
			return Response({'business_slug': ['Business listing not found.']}, status=status.HTTP_400_BAD_REQUEST)

		serializer = self.get_serializer(data=payload)
		serializer.is_valid(raise_exception=True)
		serializer.validated_data['listing_snapshot'] = sync_listing_snapshot_from_place_payload(place_payload)
		user = serializer.save()
		claim = getattr(user, '_created_business_claim', None)
		_append_uploaded_profile_photos_to_claim(request, claim)
		profile = get_or_create_account_profile(user)
		response_token = request.auth if getattr(request.user, 'is_authenticated', False) and request.user.pk == user.pk else None
		if getattr(user, '_signup_reused_existing_user', False) and profile.email_is_verified:
			send_business_claim_received_email(user, claim)
			payload = build_account_response(user, 'business', claim=claim, token=response_token)
			payload['detail'] = payload.get('claim_review_message') or ''
			return Response(payload, status=status.HTTP_201_CREATED)
		return Response(build_email_verification_challenge(user, 'business', claim=claim), status=status.HTTP_201_CREATED)


class ManualBusinessSignupView(generics.GenericAPIView):
	serializer_class = ManualBusinessSignupSerializer
	parser_classes = [MultiPartParser, FormParser, JSONParser]

	def post(self, request):
		serializer = self.get_serializer(data=build_signup_request_data(request.data))
		serializer.is_valid(raise_exception=True)
		user = serializer.save()
		claim = getattr(user, '_created_business_claim', None)
		_append_uploaded_profile_photos_to_claim(request, claim)
		profile = get_or_create_account_profile(user)
		if getattr(user, '_signup_reused_existing_user', False) and profile.email_is_verified:
			send_business_claim_received_email(user, claim)
			payload = build_account_response(user, 'business', claim=claim, token=None)
			payload['detail'] = payload.get('claim_review_message') or ''
			return Response(payload, status=status.HTTP_201_CREATED)
		return Response(build_email_verification_challenge(user, 'business', claim=claim), status=status.HTTP_201_CREATED)


class InformalBusinessSignupView(generics.GenericAPIView):
	serializer_class = InformalBusinessSignupSerializer
	parser_classes = [MultiPartParser, FormParser, JSONParser]

	def post(self, request):
		serializer = self.get_serializer(data=build_signup_request_data(request.data))
		serializer.is_valid(raise_exception=True)
		user = serializer.save()
		claim = getattr(user, '_created_business_claim', None)
		_append_uploaded_profile_photos_to_claim(request, claim)
		profile = get_or_create_account_profile(user)
		if getattr(user, '_signup_reused_existing_user', False) and profile.email_is_verified:
			send_business_claim_received_email(user, claim)
			payload = build_account_response(user, 'business', claim=claim, token=None)
			payload['detail'] = payload.get('claim_review_message') or ''
			return Response(payload, status=status.HTTP_201_CREATED)
		return Response(build_email_verification_challenge(user, 'business', claim=claim), status=status.HTTP_201_CREATED)


class VerifyEmailCodeView(generics.GenericAPIView):
	serializer_class = EmailVerificationCodeSerializer

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		user = User.objects.filter(username__iexact=serializer.validated_data['username']).first()
		if user is None:
			return Response({'detail': 'No account matches that username.'}, status=status.HTTP_404_NOT_FOUND)

		profile = get_or_create_account_profile(user)
		if profile.email_is_verified:
			return Response({'detail': 'That email is already verified.'}, status=status.HTTP_400_BAD_REQUEST)
		if not profile.verify_email_verification_code(serializer.validated_data['code']):
			return Response({'detail': 'The email verification code is invalid or expired.'}, status=status.HTTP_400_BAD_REQUEST)

		profile.mark_email_verified()
		portal = infer_portal_for_user(user, serializer.validated_data.get('portal'))
		hold_claim = get_business_access_hold_claim(user, portal)
		if hold_claim is not None:
			send_business_claim_received_email(user, hold_claim)
			payload = build_account_response(user, portal, claim=hold_claim, token=None)
			payload['detail'] = payload.get('claim_review_message') or ''
			return Response(payload)
		token = get_or_create_profile_token(user)
		return Response(build_account_response(user, portal, token=token))


class ResendEmailVerificationCodeView(generics.GenericAPIView):
	serializer_class = ResendEmailVerificationCodeSerializer

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		user = User.objects.filter(username__iexact=serializer.validated_data['username']).first()
		if user is None:
			return Response({'detail': 'No account matches that username.'}, status=status.HTTP_404_NOT_FOUND)

		profile = get_or_create_account_profile(user)
		if profile.email_is_verified:
			return Response({'detail': 'That email is already verified.'}, status=status.HTTP_400_BAD_REQUEST)

		seconds_remaining = profile.get_email_verification_seconds_remaining()
		if seconds_remaining > 0:
			return Response({
				'detail': 'Wait for the current verification code to expire before requesting a new one.',
				'seconds_remaining': seconds_remaining,
			}, status=status.HTTP_400_BAD_REQUEST)

		portal = infer_portal_for_user(user, serializer.validated_data.get('portal'))
		return Response(build_email_verification_challenge(user, portal, force_resend=True))


class ProfileDashboardView(APIView):
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def get(self, request):
		portal = infer_portal_for_user(request.user, request.query_params.get('portal'))
		return Response(build_account_response(request.user, portal, token=request.auth))

	def post(self, request):
		portal = infer_portal_for_user(request.user, request.data.get('portal') or request.query_params.get('portal'))
		serializer = ProfileDashboardUpdateSerializer(data=request.data, context={'request': request})
		serializer.is_valid(raise_exception=True)

		user = request.user
		profile = get_or_create_account_profile(user)
		previous_email = user.email
		email_changed = serializer.validated_data['email'] != user.email

		user.username = serializer.validated_data['username']
		user.email = serializer.validated_data['email']
		user.first_name = serializer.validated_data.get('first_name', '')
		user.last_name = serializer.validated_data.get('last_name', '')
		user.save(update_fields=['username', 'email', 'first_name', 'last_name'])

		if email_changed:
			profile.previous_verified_email = previous_email
			profile.pending_email = serializer.validated_data['email']
			profile.email_change_requested_at = timezone.now()
			profile.email_verified_at = None
			profile.email_verification_token = ''
			profile.clear_email_verification_code()
			profile.save(update_fields=['previous_verified_email', 'pending_email', 'email_change_requested_at', 'email_verified_at', 'email_verification_token', 'email_verification_code', 'email_verification_code_sent_at', 'updated_at'])
			send_verification_email(user, profile)

		business_field_names = {
			'contact_name',
			'job_title',
			'work_email',
			'work_phone',
			'employer_address',
			'business_website_url',
			'social_profiles',
			'deal_overrides',
			'operating_hour_overrides',
			'social_media_links_text',
			'offer_entries_text',
			'hours_of_operation_entries_text',
			'photo_references_text',
			'supporting_details',
			'direct_messaging_enabled',
		}
		has_business_updates = any(field_name in serializer.validated_data for field_name in business_field_names)
		if has_business_updates:
			membership = user.business_memberships.select_related('claim__listing_snapshot').filter(is_active=True).first()
			if membership is None:
				return Response({'detail': 'An approved business membership is required before editing the business profile.'}, status=status.HTTP_400_BAD_REQUEST)

			claim = membership.claim
			snapshot = claim.listing_snapshot
			changed_business_fields = set()
			try:
				uploaded_photo_urls = _save_uploaded_profile_photo_urls(request, claim)
			except ValueError as error:
				return Response({'detail': str(error)}, status=status.HTTP_400_BAD_REQUEST)
			claim_update_fields = []
			snapshot_update_fields = []
			profile_entry_payload = {}

			for field_name in ('contact_name', 'job_title', 'work_email', 'work_phone', 'employer_address', 'supporting_details'):
				if field_name in serializer.validated_data:
					new_value = serializer.validated_data[field_name]
					if getattr(claim, field_name) != new_value:
						setattr(claim, field_name, new_value)
						claim_update_fields.append(field_name)
						changed_business_fields.add(field_name)

			if 'direct_messaging_enabled' in serializer.validated_data:
				direct_messaging_enabled = bool(serializer.validated_data['direct_messaging_enabled'])
				if claim.direct_messaging_enabled != direct_messaging_enabled:
					claim.direct_messaging_enabled = direct_messaging_enabled
					claim_update_fields.append('direct_messaging_enabled')
					changed_business_fields.add('direct_messaging_enabled')

			if any(field_name in serializer.validated_data for field_name in ('business_website_url', 'social_profiles', 'social_media_links_text')):
				current_profiles = normalize_social_profiles(
					claim.social_profiles,
					fallback_website_url=claim.business_website_url,
					fallback_social_links=claim.social_media_links,
				)
				submitted_profiles = normalize_social_profiles(
					serializer.validated_data.get('social_profiles', claim.social_profiles or {}),
					fallback_website_url=serializer.validated_data.get('business_website_url', claim.business_website_url or ''),
					fallback_social_links=serializer.validated_data.get('social_media_links_text', claim.social_media_links or []),
				)
				social_profiles_changed = current_profiles != submitted_profiles
				website_changed = get_business_website_url(current_profiles, fallback=claim.business_website_url) != get_business_website_url(
					submitted_profiles,
					fallback=serializer.validated_data.get('business_website_url', claim.business_website_url or ''),
				)
				if social_profiles_changed or website_changed:
					normalized_social_profiles = submitted_profiles or {}
					normalized_social_links = build_social_media_links(normalized_social_profiles)
					normalized_website_url = get_business_website_url(
						normalized_social_profiles,
						fallback=serializer.validated_data.get('business_website_url', claim.business_website_url or ''),
					)
					claim.social_profiles = normalized_social_profiles
					claim.social_media_links = normalized_social_links
					claim.business_website_url = normalized_website_url
					claim_update_fields.extend(['social_profiles', 'social_media_links', 'business_website_url'])
					profile_entry_payload['social_media_links'] = claim.social_media_links
					changed_business_fields.update({'business_website_url', 'social_profiles', 'social_media_links_text'})

			if 'deal_overrides' in serializer.validated_data:
				incoming_deal_overrides = merge_uploaded_deal_attachments(request, claim, serializer.validated_data.get('deal_overrides', []))
				if list(claim.deal_overrides or []) != list(incoming_deal_overrides or []):
					claim.deal_overrides = incoming_deal_overrides
					claim_update_fields.append('deal_overrides')
					changed_business_fields.add('deal_overrides')

			if 'operating_hour_overrides' in serializer.validated_data:
				incoming_hour_overrides = serializer.validated_data.get('operating_hour_overrides', [])
				if list(claim.operating_hour_overrides or []) != list(incoming_hour_overrides or []):
					claim.operating_hour_overrides = incoming_hour_overrides
					claim_update_fields.append('operating_hour_overrides')
					changed_business_fields.add('operating_hour_overrides')

			for request_field_name, claim_field_name in (
				('offer_entries_text', 'offer_entries'),
				('hours_of_operation_entries_text', 'hours_of_operation_entries'),
				('photo_references_text', 'photo_references'),
			):
				if request_field_name in serializer.validated_data:
					normalized_entries = _normalize_string_list(serializer.validated_data[request_field_name])
					current_entries = list(getattr(claim, claim_field_name) or [])
					if current_entries != normalized_entries:
						setattr(claim, claim_field_name, normalized_entries)
						claim_update_fields.append(claim_field_name)
						profile_entry_payload[claim_field_name] = normalized_entries
						changed_business_fields.add(request_field_name)
						if claim_field_name == 'photo_references':
							claim.photo_gallery_overridden = True
							claim_update_fields.append('photo_gallery_overridden')

			if uploaded_photo_urls:
				merged_photo_references = list(dict.fromkeys([*list(claim.photo_references or []), *uploaded_photo_urls]))
				if list(claim.photo_references or []) != merged_photo_references:
					claim.photo_references = merged_photo_references
					claim_update_fields.append('photo_references')
					claim.photo_gallery_overridden = True
					claim_update_fields.append('photo_gallery_overridden')
					profile_entry_payload['photo_references'] = claim.photo_references
					changed_business_fields.add('photo_references_text')

			if claim_update_fields:
				claim.save(update_fields=list(dict.fromkeys([*claim_update_fields, 'updated_at'])))
			if profile_entry_payload:
				_replace_claim_profile_entries(claim, profile_entry_payload)
			if snapshot_update_fields:
				snapshot.save(update_fields=list(dict.fromkeys(snapshot_update_fields)))
			if changed_business_fields:
				create_notifications_for_business_profile_update(claim, changed_business_fields)

		response_payload = build_account_response(user, portal, token=request.auth)
		response_payload['detail'] = 'Profile updated. Verify your new email address to finish the email change.' if email_changed else 'Profile updated.'
		return Response(response_payload)


class BusinessLocationUpdateView(generics.GenericAPIView):
	serializer_class = BusinessLocationUpdateSerializer
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		membership = request.user.business_memberships.select_related('claim__listing_snapshot').filter(is_active=True).first()
		if membership is None:
			return Response({'detail': 'An approved business membership is required before sending location updates.'}, status=status.HTTP_400_BAD_REQUEST)

		snapshot = membership.claim.listing_snapshot
		if snapshot.venue_type != VenueType.MOBILE and not snapshot.serves_multiple_areas:
			return Response({'detail': 'Live location updates are only required for service area businesses.'}, status=status.HTTP_400_BAD_REQUEST)
		if not get_or_create_account_profile(request.user).business_location_tracking_enabled:
			return Response({'detail': 'Turn on location services in settings before sending live business location updates.'}, status=status.HTTP_400_BAD_REQUEST)

		snapshot.tracked_location_latitude = serializer.validated_data['latitude']
		snapshot.tracked_location_longitude = serializer.validated_data['longitude']
		snapshot.tracked_location_accuracy_meters = serializer.validated_data.get('accuracy_meters')
		snapshot.tracked_location_updated_at = timezone.now()
		snapshot.save(update_fields=['tracked_location_latitude', 'tracked_location_longitude', 'tracked_location_accuracy_meters', 'tracked_location_updated_at', 'updated_at'])

		return Response(build_account_response(request.user, 'business', token=request.auth))


class BusinessLocationTrackingPreferenceView(generics.GenericAPIView):
	serializer_class = BusinessLocationTrackingPreferenceSerializer
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		membership = request.user.business_memberships.select_related('claim__listing_snapshot').filter(is_active=True).first()
		if membership is None:
			return Response({'detail': 'An approved business membership is required before changing live location settings.'}, status=status.HTTP_400_BAD_REQUEST)

		snapshot = membership.claim.listing_snapshot
		if snapshot.venue_type != VenueType.MOBILE and not snapshot.serves_multiple_areas:
			return Response({'detail': 'Live location settings are only available for service area businesses.'}, status=status.HTTP_400_BAD_REQUEST)

		profile = get_or_create_account_profile(request.user)
		enabled = serializer.validated_data['enabled']
		profile.business_location_tracking_enabled = enabled
		profile.save(update_fields=['business_location_tracking_enabled', 'updated_at'])

		if not enabled:
			snapshot.tracked_location_latitude = None
			snapshot.tracked_location_longitude = None
			snapshot.tracked_location_accuracy_meters = None
			snapshot.tracked_location_updated_at = None
			snapshot.save(update_fields=['tracked_location_latitude', 'tracked_location_longitude', 'tracked_location_accuracy_meters', 'tracked_location_updated_at', 'updated_at'])

		return Response(build_account_response(request.user, 'business', token=request.auth))


class ResendVerificationEmailView(APIView):
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def post(self, request):
		profile = get_or_create_account_profile(request.user)
		if profile.email_is_verified:
			return Response({'detail': 'Email is already verified.'})
		send_verification_email(request.user, profile)
		return Response({'detail': 'Verification email sent.'})


class FavoriteBusinessView(APIView):
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def post(self, request):
		serializer = FavoriteBusinessToggleSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		portal = infer_portal_for_user(request.user, serializer.validated_data.get('portal'))
		if portal != 'customer':
			return Response({'detail': 'Only customer accounts can favorite businesses.'}, status=status.HTTP_403_FORBIDDEN)
		place_payload = get_source_place_payload(serializer.validated_data['slug'])
		if place_payload is None:
			return Response({'detail': 'That business could not be found.'}, status=status.HTTP_404_NOT_FOUND)

		if serializer.validated_data['favorited']:
			FavoriteBusiness.objects.update_or_create(
				user=request.user,
				listing_slug=place_payload['slug'],
				defaults={
					'name': place_payload.get('name', ''),
					'city': place_payload.get('city', ''),
					'city_label': place_payload.get('city_label', ''),
					'venue_type': place_payload.get('venue_type', ''),
					'venue_type_label': place_payload.get('venue_type_label', ''),
					'address_line_1': place_payload.get('address_line_1', ''),
					'website_url': place_payload.get('website_url', ''),
				},
			)
			detail = 'Business favorited.'
		else:
			FavoriteBusiness.objects.filter(user=request.user, listing_slug=place_payload['slug']).delete()
			detail = 'Business removed from favorites.'

		response_payload = build_account_response(request.user, portal, token=request.auth)
		response_payload['detail'] = detail
		return Response(response_payload)


class DirectMessageThreadsView(APIView):
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def get(self, request):
		portal = infer_portal_for_user(request.user, request.query_params.get('portal'))
		threads = self._get_threads_for_portal(request.user, portal)
		thread_payloads = [
			_build_direct_message_thread_payload(thread, request.user)
			for thread in threads
		]
		serializer = DirectMessageThreadListSerializer(thread_payloads, many=True)
		return Response({'threads': serializer.data})

	def post(self, request):
		serializer = DirectMessageSendSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		portal = infer_portal_for_user(request.user, serializer.validated_data.get('portal'))
		listing_slug = str(serializer.validated_data.get('listing_slug') or '').strip()
		thread_id = serializer.validated_data.get('thread_id')
		message_text = str(serializer.validated_data.get('message') or '').strip()
		message_image = serializer.validated_data.get('image')

		if listing_slug:
			if portal != 'customer':
				return Response({'detail': 'Only customer accounts can start direct messages from a business profile.'}, status=status.HTTP_403_FORBIDDEN)
			claim = _get_active_business_claim_by_slug(listing_slug)
			if claim is None:
				return Response({'detail': 'Direct messaging is only available for approved business profiles.'}, status=status.HTTP_404_NOT_FOUND)
			if not claim.direct_messaging_enabled:
				return Response({'detail': 'This business has direct messaging turned off.'}, status=status.HTTP_403_FORBIDDEN)
			if claim.direct_message_blocks.filter(customer=request.user).exists():
				return Response({'detail': 'This business has restricted direct messaging for your account.'}, status=status.HTTP_403_FORBIDDEN)
			thread, _ = BusinessDirectMessageThread.objects.get_or_create(
				business_claim=claim,
				customer=request.user,
				defaults={'last_message_at': timezone.now()},
			)
		else:
			thread = self._get_thread_for_portal(request.user, portal, thread_id)
			if thread is None:
				return Response({'detail': 'Direct message thread not found.'}, status=status.HTTP_404_NOT_FOUND)
			if portal == 'customer':
				if not thread.business_claim.direct_messaging_enabled:
					return Response({'detail': 'This business has direct messaging turned off.'}, status=status.HTTP_403_FORBIDDEN)
				if thread.business_claim.direct_message_blocks.filter(customer=request.user).exists():
					return Response({'detail': 'This business has restricted direct messaging for your account.'}, status=status.HTTP_403_FORBIDDEN)
			elif thread.business_claim.direct_message_blocks.filter(customer=thread.customer).exists():
				return Response({'detail': 'Unblock this customer before sending a direct message.'}, status=status.HTTP_403_FORBIDDEN)

		if portal == 'customer':
			if not message_text:
				return Response({'detail': 'Customer direct messages must include text.'}, status=status.HTTP_400_BAD_REQUEST)
			if message_image is not None:
				return Response({'detail': 'Customer direct messages cannot include images.'}, status=status.HTTP_400_BAD_REQUEST)
		else:
			if not message_text and message_image is None:
				return Response({'detail': 'Business direct messages must include text or an image.'}, status=status.HTTP_400_BAD_REQUEST)

		message = BusinessDirectMessage(
			thread=thread,
			sender=request.user,
			body=message_text,
			image=message_image,
		)
		message.full_clean()
		message.save()
		thread.last_message_at = message.created_at
		thread.save(update_fields=['last_message_at', 'updated_at'])
		recipient_id = thread.business_claim.claimant_id if request.user.id == thread.customer_id else thread.customer_id
		send_push_notifications_for_direct_message(
			[recipient_id],
			thread_id=thread.id,
			listing_slug=thread.business_claim.listing_snapshot.listing_slug,
			title=f'New direct message from {request.user.username}',
			message='Sent a photo.' if message.image else (message.body[:120] or 'Sent you a message.'),
		)

		thread_payload = DirectMessageThreadListSerializer(_build_direct_message_thread_payload(thread, request.user)).data
		message_payload = DirectMessageItemSerializer(_build_direct_message_item_payload(message, request=request)).data
		return Response(
			{
				'detail': 'Direct message sent.',
				'thread': thread_payload,
				'message': message_payload,
			},
			status=status.HTTP_201_CREATED,
		)

	def _get_threads_for_portal(self, user, portal):
		queryset = BusinessDirectMessageThread.objects.select_related(
			'business_claim__listing_snapshot',
			'customer',
		).prefetch_related('messages__sender')
		if portal == 'business':
			return list(
				queryset
				.filter(
					business_claim__membership__is_active=True,
					business_claim__membership__user=user,
				)
				.distinct()
			)
		threads = list(queryset.filter(customer=user))
		return [thread for thread in threads if _customer_can_access_direct_message_thread(user, thread)]

	def _get_thread_for_portal(self, user, portal, thread_id):
		queryset = BusinessDirectMessageThread.objects.select_related(
			'business_claim__listing_snapshot',
			'customer',
		).prefetch_related('messages__sender')
		if portal == 'business':
			return queryset.filter(
				id=thread_id,
				business_claim__membership__is_active=True,
				business_claim__membership__user=user,
			).distinct().first()
		thread = queryset.filter(id=thread_id, customer=user).first()
		if not _customer_can_access_direct_message_thread(user, thread):
			return None
		return thread


class DirectMessageThreadDetailView(APIView):
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def get(self, request, thread_id):
		portal = infer_portal_for_user(request.user, request.query_params.get('portal'))
		if portal == 'business':
			thread = BusinessDirectMessageThread.objects.select_related(
				'business_claim__listing_snapshot',
				'customer',
			).filter(
				id=thread_id,
				business_claim__membership__is_active=True,
				business_claim__membership__user=request.user,
			).distinct().first()
		else:
			thread = BusinessDirectMessageThread.objects.select_related(
				'business_claim__listing_snapshot',
				'customer',
			).filter(id=thread_id, customer=request.user).first()
			if not _customer_can_access_direct_message_thread(request.user, thread):
				thread = None
		if thread is None:
			return Response({'detail': 'Direct message thread not found.'}, status=status.HTTP_404_NOT_FOUND)

		BusinessDirectMessage.objects.filter(thread=thread, read_at__isnull=True).exclude(sender_id=request.user.id).update(read_at=timezone.now())
		messages = list(thread.messages.select_related('sender').order_by('created_at', 'id'))
		thread_payload = DirectMessageThreadListSerializer(_build_direct_message_thread_payload(thread, request.user)).data
		message_payloads = [
			_build_direct_message_item_payload(message, request=request)
			for message in messages
		]
		return Response({
			'thread': thread_payload,
			'messages': DirectMessageItemSerializer(message_payloads, many=True).data,
		})

	def delete(self, request, thread_id):
		portal = infer_portal_for_user(request.user, request.query_params.get('portal') or request.data.get('portal'))
		if portal != 'business':
			return Response({'detail': 'Only business accounts can delete direct message conversations.'}, status=status.HTTP_403_FORBIDDEN)

		thread = BusinessDirectMessageThread.objects.filter(
			id=thread_id,
			business_claim__membership__is_active=True,
			business_claim__membership__user=request.user,
		).distinct().first()
		if thread is None:
			return Response({'detail': 'Direct message thread not found.'}, status=status.HTTP_404_NOT_FOUND)

		thread.delete()
		return Response({'detail': 'Conversation permanently deleted.'})


class DirectMessageBlocksView(APIView):
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def get(self, request):
		portal = infer_portal_for_user(request.user, request.query_params.get('portal'))
		if portal != 'business':
			return Response({'detail': 'Only business accounts can manage direct message restrictions.'}, status=status.HTTP_403_FORBIDDEN)
		return Response(build_account_response(request.user, portal, token=request.auth))

	def post(self, request):
		serializer = DirectMessageBlockSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		portal = infer_portal_for_user(request.user, serializer.validated_data.get('portal'))
		if portal != 'business':
			return Response({'detail': 'Only business accounts can block customer direct messages.'}, status=status.HTTP_403_FORBIDDEN)

		membership = request.user.business_memberships.select_related('claim').filter(is_active=True).first()
		if membership is None:
			return Response({'detail': 'An approved business membership is required before blocking direct messages.'}, status=status.HTTP_400_BAD_REQUEST)

		customer = User.objects.filter(username__iexact=serializer.validated_data['customer_username']).first()
		if customer is None:
			return Response({'detail': 'That customer account could not be found.'}, status=status.HTTP_404_NOT_FOUND)
		if infer_portal_for_user(customer, 'customer') != 'customer':
			return Response({'detail': 'Only customer accounts can be blocked from direct messaging.'}, status=status.HTTP_400_BAD_REQUEST)

		BusinessDirectMessageBlock.objects.update_or_create(
			business_claim=membership.claim,
			customer=customer,
			defaults={'blocked_by': request.user},
		)
		response_payload = build_account_response(request.user, portal, token=request.auth)
		response_payload['detail'] = f'Direct messaging blocked for {customer.username}.'
		return Response(response_payload)


class DirectMessageBlockDetailView(APIView):
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def delete(self, request, block_id):
		portal = infer_portal_for_user(request.user, request.query_params.get('portal') or request.data.get('portal'))
		if portal != 'business':
			return Response({'detail': 'Only business accounts can unblock customer direct messages.'}, status=status.HTTP_403_FORBIDDEN)

		membership = request.user.business_memberships.select_related('claim').filter(is_active=True).first()
		if membership is None:
			return Response({'detail': 'An approved business membership is required before removing direct message blocks.'}, status=status.HTTP_400_BAD_REQUEST)

		deleted_count, _ = BusinessDirectMessageBlock.objects.filter(
			id=block_id,
			business_claim=membership.claim,
		).delete()
		if not deleted_count:
			return Response({'detail': 'That direct message block could not be found.'}, status=status.HTTP_404_NOT_FOUND)

		response_payload = build_account_response(request.user, portal, token=request.auth)
		response_payload['detail'] = 'Direct message block removed.'
		return Response(response_payload)


class PushDeviceRegistrationView(APIView):
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def post(self, request):
		serializer = PushDeviceRegistrationSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		portal = infer_portal_for_user(request.user, serializer.validated_data.get('portal'))
		if portal not in {'customer', 'business'}:
			return Response({'detail': 'Sign in with a customer or business account to enable push notifications.'}, status=status.HTTP_403_FORBIDDEN)

		installation_id = serializer.validated_data['installation_id']
		push_token = serializer.validated_data['push_token']
		FavoriteBusinessPushDevice.objects.filter(expo_push_token=push_token).exclude(installation_id=installation_id).delete()
		FavoriteBusinessPushDevice.objects.update_or_create(
			installation_id=installation_id,
			defaults={
				'user': request.user,
				'expo_push_token': push_token,
				'platform': serializer.validated_data['platform'],
				'is_active': True,
				'last_error': '',
			},
		)
		return Response({'detail': 'Push notifications enabled.'})


class FavoriteBusinessNotificationsView(APIView):
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def post(self, request):
		portal = infer_portal_for_user(request.user, request.data.get('portal'))
		if portal != 'customer':
			return Response({'detail': 'Only customer accounts can clear business notifications.'}, status=status.HTTP_403_FORBIDDEN)

		FavoriteBusinessNotification.objects.filter(user=request.user).delete()
		response_payload = build_account_response(request.user, portal, token=request.auth)
		response_payload['detail'] = 'Business notifications cleared.'
		return Response(response_payload)

	def delete(self, request, notification_id):
		portal = infer_portal_for_user(request.user, request.query_params.get('portal') or request.data.get('portal'))
		if portal != 'customer':
			return Response({'detail': 'Only customer accounts can clear business notifications.'}, status=status.HTTP_403_FORBIDDEN)

		deleted_count, _ = FavoriteBusinessNotification.objects.filter(user=request.user, pk=notification_id).delete()
		if not deleted_count:
			return Response({'detail': 'That business notification could not be found.'}, status=status.HTTP_404_NOT_FOUND)

		response_payload = build_account_response(request.user, portal, token=request.auth)
		response_payload['detail'] = 'Business notification cleared.'
		return Response(response_payload)


class ContactSupportView(generics.GenericAPIView):
	serializer_class = ContactSupportSerializer
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		send_support_contact_email(
			request.user,
			message=serializer.validated_data['message'],
			portal=serializer.validated_data.get('portal'),
			subject=serializer.validated_data.get('subject', ''),
		)
		return Response({'detail': 'Your message has been sent to DiningDealz support.'})


class DeleteAccountView(generics.GenericAPIView):
	serializer_class = DeleteAccountSerializer
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def post(self, request):
		serializer = self.get_serializer(data=request.data, context={'request': request})
		serializer.is_valid(raise_exception=True)
		user = request.user
		user.delete()
		return Response({'detail': 'Account permanently deleted.'})


class ToggleTwoFactorView(APIView):
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def post(self, request):
		profile = get_or_create_account_profile(request.user)
		if profile.two_factor_enabled:
			return Response({'detail': 'Authenticator-based 2FA is already enabled.'})
		if profile.two_factor_secret:
			profile.two_factor_enabled = False
			profile.save(update_fields=['two_factor_enabled', 'updated_at'])
		manual_entry_key = profile.begin_two_factor_setup()
		return Response({
			'detail': 'Add this key to your authenticator app, then confirm with a 6-digit code.',
			'manual_entry_key': manual_entry_key,
			'otpauth_url': profile.get_two_factor_provisioning_uri(use_pending=True),
			'issuer': str(getattr(settings, 'PROFILE_TWO_FACTOR_ISSUER', 'DiningDealz') or 'DiningDealz'),
			'account_name': profile.get_two_factor_account_name(),
		})


class ConfirmTwoFactorView(generics.GenericAPIView):
	serializer_class = TwoFactorCodeSerializer
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		profile = get_or_create_account_profile(request.user)
		if not profile.two_factor_pending_secret:
			return Response({'detail': 'Start authenticator setup before confirming it.'}, status=status.HTTP_400_BAD_REQUEST)
		if not profile.verify_two_factor_code(serializer.validated_data['code'], use_pending=True):
			return Response({'code': ['The authenticator code is invalid or expired.']}, status=status.HTTP_400_BAD_REQUEST)
		profile.enable_two_factor()
		portal = infer_portal_for_user(request.user, serializer.validated_data.get('portal'))
		return Response(build_account_response(request.user, portal, token=request.auth))


class DisableTwoFactorView(generics.GenericAPIView):
	serializer_class = TwoFactorCodeSerializer
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		profile = get_or_create_account_profile(request.user)
		if not profile.two_factor_enabled or not profile.two_factor_secret:
			return Response({'detail': 'Authenticator-based 2FA is not enabled.'}, status=status.HTTP_400_BAD_REQUEST)
		if not profile.verify_two_factor_code(serializer.validated_data['code']):
			return Response({'code': ['The authenticator code is invalid or expired.']}, status=status.HTTP_400_BAD_REQUEST)
		profile.disable_two_factor()
		portal = infer_portal_for_user(request.user, serializer.validated_data.get('portal'))
		return Response(build_account_response(request.user, portal, token=request.auth))


class VerifyEmailView(APIView):
	permission_classes = []
	authentication_classes = []

	def get(self, request, token):
		from .models import AccountProfile
		account_profile = AccountProfile.objects.select_related('user').filter(email_verification_token=token).first()
		if account_profile is None:
			failure_redirect_url = str(getattr(settings, 'PROFILE_EMAIL_VERIFICATION_FAILURE_URL', '') or '').strip()
			if failure_redirect_url:
				return self._redirect_to(failure_redirect_url)
			return HttpResponse(self._build_html(
				title='Verification link is invalid or expired.',
				message='Request a new verification email from your DiningDealz dashboard and try again.',
			), status=404)
		account_profile.mark_email_verified()
		hold_claim = get_business_access_hold_claim(account_profile.user, infer_portal_for_user(account_profile.user, 'business'))
		if hold_claim is not None:
			send_business_claim_received_email(account_profile.user, hold_claim)
		success_redirect_url = str(getattr(settings, 'PROFILE_EMAIL_VERIFICATION_SUCCESS_URL', '') or '').strip()
		if success_redirect_url:
			return self._redirect_to(success_redirect_url)
		return HttpResponse(self._build_html(
			title='Email verified successfully.',
			message='You can return to DiningDealz and refresh your profile dashboard.',
		))

	def _redirect_to(self, url):
		response = HttpResponse(status=302)
		response['Location'] = url
		return response

	def _build_html(self, title, message):
		return_url = str(getattr(settings, 'PROFILE_EMAIL_VERIFICATION_RETURN_URL', '') or '').strip()
		return_link = ''
		if return_url:
			return_link = (
				f'<p style="margin-top:24px;"><a href="{return_url}" '
				'style="display:inline-block;padding:12px 18px;border-radius:999px;'
				'background:#c65d1f;color:#fffaf4;text-decoration:none;font-weight:700;">'
				'Return to DiningDealz</a></p>'
			)
		return (
			'<!doctype html>'
			'<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
			'<title>DiningDealz Email Verification</title></head>'
			'<body style="margin:0;font-family:Arial,sans-serif;background:#f7efe2;color:#2d221a;">'
			'<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">'
			'<div style="max-width:520px;width:100%;background:#fffaf4;border:1px solid #efd8bd;border-radius:24px;padding:32px;box-sizing:border-box;">'
			f'<h1 style="margin:0 0 12px;font-size:30px;line-height:1.1;">{title}</h1>'
			f'<p style="margin:0;font-size:16px;line-height:1.5;color:#5d4637;">{message}</p>'
			f'{return_link}'
			'</div></div></body></html>'
		)


class PasswordResetView(generics.GenericAPIView):
	serializer_class = PasswordResetConfirmSerializer
	permission_classes = []
	authentication_classes = []

	def get(self, request, token):
		from .models import AccountProfile
		profile = AccountProfile.objects.select_related('user').filter(password_reset_token=token).first()
		if profile is None:
			return HttpResponse(self._build_html(title='Password reset link is invalid or expired.', message='', token='', error=True), status=404)
		return HttpResponse(self._build_html(title='Reset your password', message='Enter a new password for your account.', token=token))

	def post(self, request, token):
		payload = {
			'token': token,
			'new_password': request.data.get('new_password') or request.POST.get('new_password', ''),
		}
		serializer = self.get_serializer(data=payload)
		if serializer.is_valid():
			profile = serializer.validated_data['profile']
			user = profile.user
			user.set_password(serializer.validated_data['new_password'])
			user.save(update_fields=['password'])
			profile.clear_password_reset_token()
			user.profile_auth_tokens.all().delete()
			return HttpResponse(self._build_html(title='Password updated successfully.', message='You can return to the app and sign in with your new password.', token='', success=True))

		error_message = ' '.join(sum((messages for messages in serializer.errors.values()), [])) or 'Unable to reset the password.'
		return HttpResponse(self._build_html(title='Reset your password', message='Enter a new password for your account.', token=token, error_message=error_message), status=400)

	def _build_html(self, title, message, token, error_message='', success=False, error=False):
		status_color = '#8d2500' if error or error_message else '#5d4637'
		success_block = ''
		form_block = ''
		if token and not success and not error:
			form_block = (
				f'<form method="post" style="margin-top:24px;display:grid;gap:14px;">'
				f'<input type="password" name="new_password" placeholder="New password" '
				'style="padding:14px 16px;border:1px solid #ddc4a7;border-radius:14px;font-size:16px;">'
				'<button type="submit" '
				'style="padding:12px 18px;border:none;border-radius:999px;background:#9e5b49;color:#fffaf4;font-size:15px;font-weight:700;cursor:pointer;">'
				'Update password</button></form>'
			)
		if success:
			success_block = '<p style="margin-top:24px;font-size:15px;line-height:1.5;color:#5d4637;">You can close this page after returning to the app.</p>'
		error_block = f'<p style="margin:16px 0 0;font-size:14px;line-height:1.5;color:{status_color};">{error_message}</p>' if error_message else ''
		return (
			'<!doctype html>'
			'<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
			'<title>DiningDealz Password Reset</title></head>'
			'<body style="margin:0;font-family:Arial,sans-serif;background:#f7efe2;color:#2d221a;">'
			'<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">'
			'<div style="max-width:520px;width:100%;background:#fffaf4;border:1px solid #efd8bd;border-radius:24px;padding:32px;box-sizing:border-box;">'
			f'<h1 style="margin:0 0 12px;font-size:30px;line-height:1.1;">{title}</h1>'
			f'<p style="margin:0;font-size:16px;line-height:1.5;color:#5d4637;">{message}</p>'
			f'{error_block}{form_block}{success_block}'
			'</div></div></body></html>'
		)
