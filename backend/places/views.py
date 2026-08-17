import logging
import mimetypes
import secrets

from django.conf import settings
from django.contrib.auth.models import User
from django.core.cache import caches
from django.core.files.storage import default_storage
from django.db import connection, transaction
from django.db.models import Q
from django.http import FileResponse, Http404, HttpResponse
from django.views import View
from django.urls import reverse
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


logger = logging.getLogger(__name__)

from .authentication import ProfileTokenAuthentication
from .serializers import (
	BusinessLocationTrackingPreferenceSerializer,
	BusinessLocationUpdateSerializer,
	ClaimedBusinessSignupSerializer,
	ContactSupportSerializer,
	ContentReportSerializer,
	CustomerPreferencesSerializer,
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
	LiveLocationPlaceSerializer,
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
from .services.account_profiles import build_account_response, build_email_verification_challenge, deactivate_account_for_retained_direct_messages, get_approved_business_claims, get_business_access_hold_claim, get_or_create_account_profile, get_or_create_profile_token, infer_portal_for_user, is_deleted_account, send_business_claim_received_email, send_content_report_support_email_safely, send_password_reset_email, send_support_contact_email, send_username_reminder_email, send_verification_email
from .models import BusinessClaimAttachment, BusinessDirectMessage, BusinessDirectMessageBlock, BusinessDirectMessageThread, BusinessMembership, BusinessPost, ContentReport, FavoriteBusiness, FavoriteBusinessNotification, FavoriteBusinessPushDevice, FeedImpression, ListingSnapshot, ProfileAuthToken, VenueType, business_claim_storage_prefix
from .services.favorite_notifications import create_notifications_for_business_profile_update, should_send_direct_message_notification
from .services.customer_preferences import get_preference_business_options, resolve_business_location, save_customer_preferences
from .services.happy_hour_notifications import process_due_happy_hour_notifications
from .services.direct_message_push import send_push_notifications_for_direct_message
from .services.home_feed import get_feed_interval, get_feed_queryset, get_organic_page_size, get_ranked_campaigns, get_requested_feed_page_size, mix_feed_items, record_campaign_served
from .services.image_moderation import ImageModerationRejected, ImageModerationUnavailable, moderate_uploaded_image
from .services.social_profiles import build_social_media_links, get_business_website_url, normalize_social_profiles
from .services.source_listings import get_deleted_business_snapshot_ids, get_disabled_live_location_slugs, get_live_location_display_fields, get_source_deal_payloads, get_source_place_payload, get_source_place_payloads, is_live_location_tracking_enabled_for_snapshot, load_source_records
from .throttles import ContentReportRateThrottle, DirectMessageSendRateThrottle, EmailVerificationRateThrottle, EmailVerificationResendRateThrottle, LoginRateThrottle, PasswordRecoveryRateThrottle, SignupRateThrottle, SupportContactRateThrottle, UserMutationRateThrottle


class SourcePlacePagination(PageNumberPagination):
	page_size = 100
	page_size_query_param = 'page_size'
	max_page_size = 500


class PrivateBusinessClaimAttachmentView(View):
	def get(self, request, name):
		if not getattr(request.user, 'is_authenticated', False) or not getattr(request.user, 'is_staff', False):
			raise Http404

		attachment = BusinessClaimAttachment.objects.filter(file=name).first()
		if attachment is not None and attachment.file:
			file_field = attachment.file
			content_type = attachment.content_type or 'application/octet-stream'
			original_filename = attachment.original_filename
		else:
			report = ContentReport.objects.filter(screenshot=name).first()
			if report is None or not report.screenshot:
				raise Http404
			file_field = report.screenshot
			content_type = mimetypes.guess_type(str(file_field.name or ''))[0] or 'image/jpeg'
			original_filename = Path(str(file_field.name or '')).name

		try:
			file_handle = file_field.open('rb')
		except FileNotFoundError:
			raise Http404

		response = FileResponse(file_handle, content_type=content_type)
		response['Content-Disposition'] = f'attachment; filename="{original_filename}"'
		return response


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
		moderate_uploaded_image(uploaded_file, surface='business_profile_photo')

		filename_root = Path(getattr(uploaded_file, 'name', '') or 'business-photo').stem or 'business-photo'
		safe_name = slugify(filename_root) or 'business-photo'
		saved_name = default_storage.save(
			f'{business_claim_storage_prefix(claim)}/profile-photos/{uuid4().hex}-{safe_name}{file_suffix}',
			uploaded_file,
		)
		photo_urls.append(request.build_absolute_uri(default_storage.url(saved_name)))

	return photo_urls


def _append_uploaded_profile_photos_to_claim(request, claim):
	if request is None or claim is None or getattr(claim, '_profile_photo_uploads_saved', False):
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
	if claim is not None:
		direct_messaging_enabled = bool(claim.direct_messaging_enabled)
	elif is_claimed:
		direct_messaging_enabled = False
	else:
		direct_messaging_enabled = bool(payload.get('direct_messaging_enabled', False))
	can_direct_message = False
	direct_message_restricted = False
	if claim is not None:
		can_direct_message, direct_message_restricted = _can_customer_direct_message_claim(user, claim)

	payload['direct_messaging_enabled'] = direct_messaging_enabled
	payload['direct_message_restricted'] = direct_message_restricted
	payload['can_direct_message'] = can_direct_message
	return payload


def _build_direct_message_thread_payload(thread, user):
	last_message = thread.messages.select_related('sender').order_by('-id').first()
	unread_query = thread.messages.exclude(sender_id=user.id).filter(read_at__isnull=True)
	direct_message_block = thread.business_claim.direct_message_blocks.filter(customer_id=thread.customer_id).first()
	blocked_by_current_user = bool(direct_message_block and direct_message_block.blocked_by_id == user.id)
	blocked_by_other_user = bool(direct_message_block and not blocked_by_current_user)
	if last_message is not None and last_message.image:
		last_message_preview = 'Photo expired' if last_message.image_has_expired() else 'Sent a photo'
	elif last_message is not None:
		last_message_preview = last_message.body[:160]
	else:
		last_message_preview = ''
	read_only_reason = _get_direct_message_thread_read_only_reason(thread)
	return {
		'id': thread.id,
		'business_slug': thread.business_claim.listing_snapshot.listing_slug,
		'business_name': thread.business_claim.listing_snapshot.name,
		'customer_username': _get_direct_message_display_name_for_user(thread.customer),
		'last_message_at': thread.last_message_at,
		'last_message_preview': last_message_preview,
		'unread_count': unread_query.count(),
		'read_only': bool(read_only_reason),
		'read_only_reason': read_only_reason,
		'blocked': bool(direct_message_block),
		'blocked_by_current_user': blocked_by_current_user,
		'blocked_by_other_user': blocked_by_other_user,
		'block_id': direct_message_block.id if direct_message_block else None,
	}


def _customer_can_access_direct_message_thread(user, thread):
	if thread is None:
		return False
	if is_deleted_account(user):
		return False
	if not _thread_has_active_business_participant(thread):
		return True
	direct_message_block = thread.business_claim.direct_message_blocks.filter(customer_id=user.id).first()
	if direct_message_block is not None and direct_message_block.blocked_by_id == user.id:
		return True
	can_direct_message, _ = _can_customer_direct_message_claim(user, thread.business_claim)
	return can_direct_message


def _get_direct_message_display_name_for_user(user):
	if is_deleted_account(user):
		return 'Deleted account'
	return user.username


def _thread_has_active_business_participant(thread):
	try:
		membership = thread.business_claim.membership
	except BusinessMembership.DoesNotExist:
		return False
	if not membership.is_active:
		return False
	return not is_deleted_account(thread.business_claim.claimant)


def _thread_has_active_customer_participant(thread):
	return not is_deleted_account(thread.customer)


def _get_direct_message_thread_read_only_reason(thread):
	if not _thread_has_active_customer_participant(thread):
		return 'This conversation is now read-only because the customer account was deleted.'
	if not _thread_has_active_business_participant(thread):
		return 'This conversation is now read-only because the business account was deleted.'
	return ''


def _delete_expired_direct_message_image(message):
	if not message.image or not message.image_has_expired():
		return False
	storage_name = str(getattr(message.image, 'name', '') or '').strip()
	if not storage_name:
		return False
	message.image.storage.delete(storage_name)
	return True


def _build_direct_message_item_payload(message, request=None):
	image_expired = bool(message.image and message.image_has_expired())
	if image_expired:
		_delete_expired_direct_message_image(message)
	image_url = ''
	if message.image and not image_expired:
		if request is not None:
			image_url = request.build_absolute_uri(reverse('profile-direct-message-image', kwargs={'message_id': message.id}))
		else:
			try:
				image_url = message.image.url
			except ValueError:
				image_url = ''
	return {
		'id': message.id,
		'sender_id': message.sender_id,
		'sender_username': _get_direct_message_display_name_for_user(message.sender),
		'message': message.body,
		'message_type': 'image' if message.image else 'text',
		'image_url': image_url,
		'image_expired': image_expired,
		'created_at': message.created_at,
		'read_at': message.read_at,
	}


class HealthCheckView(APIView):
	def get(self, request):
		dependencies = {
			'database': self._check_database(),
			'redis': self._check_redis(),
		}
		is_healthy = all(
			dependency['status'] == 'ok'
			or dependency['status'] == 'not_configured' and not dependency.get('required', False)
			for dependency in dependencies.values()
		)
		return Response(
			{
				'status': 'ok' if is_healthy else 'degraded',
				'service': 'happyhour-backend',
				'dependencies': dependencies,
			},
			status=status.HTTP_200_OK if is_healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
		)

	def _check_database(self):
		try:
			with connection.cursor() as cursor:
				cursor.execute('SELECT 1')
				cursor.fetchone()
			return {'status': 'ok', 'backend': connection.vendor}
		except Exception:
			logger.exception('Health check database dependency failed.')
			return {'status': 'error', 'backend': connection.vendor}

	def _check_redis(self):
		redis_configured = bool(str(getattr(settings, 'REDIS_URL', '') or '').strip())
		redis_required = redis_configured or bool(getattr(settings, 'IS_RENDER', False))
		if not redis_configured:
			return {'status': 'not_configured', 'required': redis_required}

		cache = caches['default']
		cache_key = f'health-check:{uuid4().hex}'
		try:
			cache.set(cache_key, 'ok', 5)
			if cache.get(cache_key) != 'ok':
				raise RuntimeError('Redis health-check value did not round-trip.')
			return {'status': 'ok', 'required': True}
		except Exception:
			logger.exception('Health check Redis dependency failed.')
			return {'status': 'error', 'required': True}
		finally:
			try:
				cache.delete(cache_key)
			except Exception:
				pass


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


class LiveLocationPlaceListView(generics.GenericAPIView):
	serializer_class = LiveLocationPlaceSerializer
	permission_classes = []

	def get(self, request):
		city = str(request.query_params.get('city') or '').strip().lower()
		disabled_slugs = get_disabled_live_location_slugs()
		deleted_snapshot_ids = get_deleted_business_snapshot_ids()
		queryset = (
			ListingSnapshot.objects
			.exclude(listing_slug='')
			.filter(
				Q(venue_type=VenueType.MOBILE) | Q(serves_multiple_areas=True),
				tracked_location_latitude__isnull=False,
				tracked_location_longitude__isnull=False,
			)
			.exclude(pk__in=deleted_snapshot_ids)
			.order_by('listing_slug', 'pk')
		)
		if city and city != 'all':
			queryset = queryset.filter(city=city)

		active_snapshots_by_slug = {}
		for snapshot in queryset:
			payload_slug = slugify(f'{snapshot.name}-{snapshot.city}')
			if payload_slug in disabled_slugs or not is_live_location_tracking_enabled_for_snapshot(snapshot):
				continue

			current_snapshot = active_snapshots_by_slug.get(payload_slug)
			if current_snapshot is None:
				active_snapshots_by_slug[payload_slug] = snapshot
				continue

			current_updated_at = current_snapshot.tracked_location_updated_at
			candidate_updated_at = snapshot.tracked_location_updated_at
			if (
				current_updated_at is None
				or candidate_updated_at is not None and (
					candidate_updated_at > current_updated_at
					or candidate_updated_at == current_updated_at and snapshot.pk > current_snapshot.pk
				)
			):
				active_snapshots_by_slug[payload_slug] = snapshot

		payloads = [
			{
				'slug': payload_slug,
				'latitude': snapshot.tracked_location_latitude,
				'longitude': snapshot.tracked_location_longitude,
				'updated_at': snapshot.tracked_location_updated_at,
				'tracking_enabled': True,
				**(get_live_location_display_fields(snapshot) or {}),
			}
			for payload_slug, snapshot in sorted(active_snapshots_by_slug.items())
		]
		disabled_snapshots = (
			ListingSnapshot.objects
			.exclude(listing_slug='')
			.filter(
				Q(venue_type=VenueType.MOBILE) | Q(serves_multiple_areas=True),
			)
			.exclude(pk__in=deleted_snapshot_ids)
			.order_by('listing_slug', 'pk')
		)
		if city and city != 'all':
			disabled_snapshots = disabled_snapshots.filter(city=city)
		seen_payload_slugs = {payload['slug'] for payload in payloads}
		for snapshot in disabled_snapshots:
			payload_slug = slugify(f'{snapshot.name}-{snapshot.city}')
			if payload_slug in seen_payload_slugs:
				continue
			if is_live_location_tracking_enabled_for_snapshot(snapshot):
				continue
			payloads.append({
				'slug': payload_slug,
				'latitude': None,
				'longitude': None,
				'updated_at': None,
				'tracking_enabled': False,
			})
			seen_payload_slugs.add(payload_slug)
		deleted_snapshots = (
			ListingSnapshot.objects
			.filter(pk__in=deleted_snapshot_ids)
			.exclude(listing_slug='')
			.filter(
				Q(venue_type=VenueType.MOBILE) | Q(serves_multiple_areas=True),
			)
			.order_by('listing_slug', 'pk')
		)
		if city and city != 'all':
			deleted_snapshots = deleted_snapshots.filter(city=city)
		for snapshot in deleted_snapshots:
			payload_slug = slugify(f'{snapshot.name}-{snapshot.city}')
			if payload_slug in seen_payload_slugs:
				continue
			payloads.append({
				'slug': payload_slug,
				'latitude': None,
				'longitude': None,
				'updated_at': None,
				'tracking_enabled': False,
				'place_removed': True,
			})
			seen_payload_slugs.add(payload_slug)
		serializer = self.get_serializer(payloads, many=True)
		response = Response(serializer.data)
		response['Cache-Control'] = 'no-store, no-cache, must-revalidate'
		response['Pragma'] = 'no-cache'
		response['Expires'] = '0'
		return response


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
	throttle_classes = [UserMutationRateThrottle]

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		impression = serializer.save()
		if impression.campaign_id:
			record_campaign_served(impression.campaign)
		return Response({'id': impression.id}, status=status.HTTP_201_CREATED)


class FeedEngagementView(generics.GenericAPIView):
	serializer_class = FeedEngagementWriteSerializer
	throttle_classes = [UserMutationRateThrottle]

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		engagement = serializer.save()
		return Response({'id': engagement.id}, status=status.HTTP_201_CREATED)


class CustomerSignupView(generics.GenericAPIView):
	serializer_class = CustomerSignupSerializer
	throttle_classes = [SignupRateThrottle]

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		user = serializer.save()
		return Response(build_email_verification_challenge(user, 'customer'), status=status.HTTP_201_CREATED)


class LoginView(generics.GenericAPIView):
	serializer_class = LoginSerializer
	throttle_classes = [LoginRateThrottle]

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
	throttle_classes = [PasswordRecoveryRateThrottle]

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		user = User.objects.filter(email__iexact=serializer.validated_data['email']).first()
		if user is not None and user.email:
			send_username_reminder_email(user)
		return Response({'detail': 'If that email address is registered, a username reminder has been sent.'})


class PasswordResetRequestView(generics.GenericAPIView):
	serializer_class = PasswordResetRequestSerializer
	throttle_classes = [PasswordRecoveryRateThrottle]

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
	throttle_classes = [SignupRateThrottle]

	def post(self, request):
		payload = build_signup_request_data(request.data)
		business_slug = payload.get('business_slug')
		place_payload = get_source_place_payload(business_slug)
		if place_payload is None:
			return Response({'business_slug': ['Business listing not found.']}, status=status.HTTP_400_BAD_REQUEST)

		serializer = self.get_serializer(data=payload)
		serializer.is_valid(raise_exception=True)
		with transaction.atomic():
			serializer.validated_data['listing_snapshot'] = sync_listing_snapshot_from_place_payload(place_payload)
			user = serializer.save()
			claim = getattr(user, '_created_business_claim', None)
			_append_uploaded_profile_photos_to_claim(request, claim)
			profile = get_or_create_account_profile(user)
			response_token = request.auth if getattr(request.user, 'is_authenticated', False) and request.user.pk == user.pk else None
			if getattr(user, '_signup_reused_existing_user', False) and profile.email_is_verified:
				try:
					send_business_claim_received_email(user, claim)
				except Exception:
					logger.exception('Business signup confirmation email failed for reused claimed-business signup user_id=%s claim_id=%s email_backend=%s email_host=%s email_port=%s email_use_tls=%s email_use_ssl=%s', user.pk, getattr(claim, 'pk', None), getattr(settings, 'EMAIL_BACKEND', ''), getattr(settings, 'EMAIL_HOST', ''), getattr(settings, 'EMAIL_PORT', ''), getattr(settings, 'EMAIL_USE_TLS', ''), getattr(settings, 'EMAIL_USE_SSL', ''))
					transaction.set_rollback(True)
					return Response({'detail': 'We could not send the verification email. No business claim was submitted. Check your email address and try again.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
				payload = build_account_response(user, 'business', claim=claim, token=response_token)
				payload['detail'] = payload.get('claim_review_message') or ''
				return Response(payload, status=status.HTTP_201_CREATED)
			try:
				payload = build_email_verification_challenge(user, 'business', claim=claim)
			except Exception:
				logger.exception('Business signup verification email failed for claimed-business signup user_id=%s claim_id=%s email_backend=%s email_host=%s email_port=%s email_use_tls=%s email_use_ssl=%s', user.pk, getattr(claim, 'pk', None), getattr(settings, 'EMAIL_BACKEND', ''), getattr(settings, 'EMAIL_HOST', ''), getattr(settings, 'EMAIL_PORT', ''), getattr(settings, 'EMAIL_USE_TLS', ''), getattr(settings, 'EMAIL_USE_SSL', ''))
				transaction.set_rollback(True)
				return Response({'detail': 'We could not send the verification email. No business claim was submitted. Check your email address and try again.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
			return Response(payload, status=status.HTTP_201_CREATED)


class ManualBusinessSignupView(generics.GenericAPIView):
	serializer_class = ManualBusinessSignupSerializer
	parser_classes = [MultiPartParser, FormParser, JSONParser]
	throttle_classes = [SignupRateThrottle]

	def post(self, request):
		serializer = self.get_serializer(data=build_signup_request_data(request.data))
		serializer.is_valid(raise_exception=True)
		with transaction.atomic():
			user = serializer.save()
			claim = getattr(user, '_created_business_claim', None)
			_append_uploaded_profile_photos_to_claim(request, claim)
			profile = get_or_create_account_profile(user)
			if getattr(user, '_signup_reused_existing_user', False) and profile.email_is_verified:
				try:
					send_business_claim_received_email(user, claim)
				except Exception:
					logger.exception('Business signup confirmation email failed for manual-business signup user_id=%s claim_id=%s email_backend=%s email_host=%s email_port=%s email_use_tls=%s email_use_ssl=%s', user.pk, getattr(claim, 'pk', None), getattr(settings, 'EMAIL_BACKEND', ''), getattr(settings, 'EMAIL_HOST', ''), getattr(settings, 'EMAIL_PORT', ''), getattr(settings, 'EMAIL_USE_TLS', ''), getattr(settings, 'EMAIL_USE_SSL', ''))
					transaction.set_rollback(True)
					return Response({'detail': 'We could not send the verification email. No business claim was submitted. Check your email address and try again.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
				payload = build_account_response(user, 'business', claim=claim, token=None)
				payload['detail'] = payload.get('claim_review_message') or ''
				return Response(payload, status=status.HTTP_201_CREATED)
			try:
				payload = build_email_verification_challenge(user, 'business', claim=claim)
			except Exception:
				logger.exception('Business signup verification email failed for manual-business signup user_id=%s claim_id=%s email_backend=%s email_host=%s email_port=%s email_use_tls=%s email_use_ssl=%s', user.pk, getattr(claim, 'pk', None), getattr(settings, 'EMAIL_BACKEND', ''), getattr(settings, 'EMAIL_HOST', ''), getattr(settings, 'EMAIL_PORT', ''), getattr(settings, 'EMAIL_USE_TLS', ''), getattr(settings, 'EMAIL_USE_SSL', ''))
				transaction.set_rollback(True)
				return Response({'detail': 'We could not send the verification email. No business claim was submitted. Check your email address and try again.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
			return Response(payload, status=status.HTTP_201_CREATED)


class InformalBusinessSignupView(generics.GenericAPIView):
	serializer_class = InformalBusinessSignupSerializer
	parser_classes = [MultiPartParser, FormParser, JSONParser]
	throttle_classes = [SignupRateThrottle]

	def post(self, request):
		serializer = self.get_serializer(data=build_signup_request_data(request.data))
		serializer.is_valid(raise_exception=True)
		with transaction.atomic():
			user = serializer.save()
			claim = getattr(user, '_created_business_claim', None)
			_append_uploaded_profile_photos_to_claim(request, claim)
			profile = get_or_create_account_profile(user)
			if getattr(user, '_signup_reused_existing_user', False) and profile.email_is_verified:
				try:
					send_business_claim_received_email(user, claim)
				except Exception:
					logger.exception('Business signup confirmation email failed for informal-business signup user_id=%s claim_id=%s email_backend=%s email_host=%s email_port=%s email_use_tls=%s email_use_ssl=%s', user.pk, getattr(claim, 'pk', None), getattr(settings, 'EMAIL_BACKEND', ''), getattr(settings, 'EMAIL_HOST', ''), getattr(settings, 'EMAIL_PORT', ''), getattr(settings, 'EMAIL_USE_TLS', ''), getattr(settings, 'EMAIL_USE_SSL', ''))
					transaction.set_rollback(True)
					return Response({'detail': 'We could not send the verification email. No business claim was submitted. Check your email address and try again.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
				payload = build_account_response(user, 'business', claim=claim, token=None)
				payload['detail'] = payload.get('claim_review_message') or ''
				return Response(payload, status=status.HTTP_201_CREATED)
			try:
				payload = build_email_verification_challenge(user, 'business', claim=claim)
			except Exception:
				logger.exception('Business signup verification email failed for informal-business signup user_id=%s claim_id=%s email_backend=%s email_host=%s email_port=%s email_use_tls=%s email_use_ssl=%s', user.pk, getattr(claim, 'pk', None), getattr(settings, 'EMAIL_BACKEND', ''), getattr(settings, 'EMAIL_HOST', ''), getattr(settings, 'EMAIL_PORT', ''), getattr(settings, 'EMAIL_USE_TLS', ''), getattr(settings, 'EMAIL_USE_SSL', ''))
				transaction.set_rollback(True)
				return Response({'detail': 'We could not send the verification email. No business claim was submitted. Check your email address and try again.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
			return Response(payload, status=status.HTTP_201_CREATED)


class VerifyEmailCodeView(generics.GenericAPIView):
	serializer_class = EmailVerificationCodeSerializer
	throttle_classes = [EmailVerificationRateThrottle]

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
	throttle_classes = [EmailVerificationResendRateThrottle]

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
	throttle_classes = [UserMutationRateThrottle]

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
			except ImageModerationUnavailable as error:
				return Response({'detail': str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
			except ImageModerationRejected as error:
				return Response({'detail': str(error)}, status=status.HTTP_400_BAD_REQUEST)
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
	throttle_classes = [UserMutationRateThrottle]

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		approved_claim = next(iter(get_approved_business_claims(request.user)), None)
		if approved_claim is None:
			return Response({'detail': 'An approved business claim is required before sending location updates.'}, status=status.HTTP_400_BAD_REQUEST)

		snapshot = approved_claim.listing_snapshot
		if snapshot.venue_type != VenueType.MOBILE and not snapshot.serves_multiple_areas:
			return Response({'detail': 'Live location updates are only required for service area businesses.'}, status=status.HTTP_400_BAD_REQUEST)
		if not get_or_create_account_profile(request.user).business_location_tracking_enabled:
			return Response({'detail': 'Turn on location services in settings before sending live business location updates.'}, status=status.HTTP_400_BAD_REQUEST)

		now = timezone.now()
		reported_address_line_1 = str(serializer.validated_data.get('address_line_1') or '').strip()
		reported_city_label = str(serializer.validated_data.get('city_label') or '').strip()
		with transaction.atomic():
			snapshot.tracked_location_latitude = serializer.validated_data['latitude']
			snapshot.tracked_location_longitude = serializer.validated_data['longitude']
			if reported_address_line_1:
				snapshot.tracked_location_address_line_1 = reported_address_line_1
			if reported_city_label:
				snapshot.tracked_location_city_label = reported_city_label
			snapshot.tracked_location_accuracy_meters = serializer.validated_data.get('accuracy_meters')
			snapshot.tracked_location_updated_at = now
			snapshot.save(update_fields=['tracked_location_latitude', 'tracked_location_longitude', 'tracked_location_address_line_1', 'tracked_location_city_label', 'tracked_location_accuracy_meters', 'tracked_location_updated_at', 'updated_at'])

		return Response(build_account_response(request.user, 'business', token=request.auth))


class BusinessLocationTrackingPreferenceView(generics.GenericAPIView):
	serializer_class = BusinessLocationTrackingPreferenceSerializer
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]
	throttle_classes = [UserMutationRateThrottle]

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		approved_claim = next(iter(get_approved_business_claims(request.user)), None)
		if approved_claim is None:
			return Response({'detail': 'An approved business claim is required before changing live location settings.'}, status=status.HTTP_400_BAD_REQUEST)

		snapshot = approved_claim.listing_snapshot
		if snapshot.venue_type != VenueType.MOBILE and not snapshot.serves_multiple_areas:
			return Response({'detail': 'Live location settings are only available for service area businesses.'}, status=status.HTTP_400_BAD_REQUEST)

		profile = get_or_create_account_profile(request.user)
		enabled = serializer.validated_data['enabled']
		profile.business_location_tracking_enabled = enabled
		profile.save(update_fields=['business_location_tracking_enabled', 'updated_at'])

		if not enabled:
			snapshot.tracked_location_latitude = None
			snapshot.tracked_location_longitude = None
			snapshot.tracked_location_address_line_1 = ''
			snapshot.tracked_location_city_label = ''
			snapshot.tracked_location_accuracy_meters = None
			snapshot.tracked_location_updated_at = None
			snapshot.save(update_fields=['tracked_location_latitude', 'tracked_location_longitude', 'tracked_location_address_line_1', 'tracked_location_city_label', 'tracked_location_accuracy_meters', 'tracked_location_updated_at', 'updated_at'])

		return Response(build_account_response(request.user, 'business', token=request.auth))


class ResendVerificationEmailView(APIView):
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]
	throttle_classes = [EmailVerificationResendRateThrottle]

	def post(self, request):
		profile = get_or_create_account_profile(request.user)
		if profile.email_is_verified:
			return Response({'detail': 'Email is already verified.'})
		send_verification_email(request.user, profile)
		return Response({'detail': 'Verification email sent.'})


class FavoriteBusinessView(APIView):
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]
	throttle_classes = [UserMutationRateThrottle]

	def post(self, request):
		serializer = FavoriteBusinessToggleSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		portal = infer_portal_for_user(request.user, serializer.validated_data.get('portal'))
		if portal != 'customer':
			return Response({'detail': 'Only customer accounts can favorite businesses.'}, status=status.HTTP_403_FORBIDDEN)
		place_payload = get_source_place_payload(serializer.validated_data['slug'])
		if place_payload is None:
			return Response({'detail': 'That business could not be found.'}, status=status.HTTP_404_NOT_FOUND)
		try:
			listing_slug, location = resolve_business_location(
				serializer.validated_data['slug'],
				serializer.validated_data.get('location_id'),
				payload=place_payload,
			)
		except ValueError as error:
			return Response({'detail': str(error)}, status=status.HTTP_404_NOT_FOUND)
		location_id = location.get('id') if serializer.validated_data.get('location_id') is not None else None

		if serializer.validated_data['favorited']:
			FavoriteBusiness.objects.update_or_create(
				user=request.user,
				listing_slug=listing_slug,
				location_id=location_id,
				defaults={
					'name': location.get('name', ''),
					'city': location.get('city', ''),
					'city_label': location.get('city_label', ''),
					'venue_type': location.get('venue_type', ''),
					'venue_type_label': location.get('venue_type_label', ''),
					'address_line_1': location.get('address_line_1', ''),
					'website_url': location.get('website_url', ''),
				},
			)
			detail = 'Business favorited.'
		else:
			favorite_query = FavoriteBusiness.objects.filter(user=request.user, listing_slug=listing_slug)
			if serializer.validated_data.get('location_id') is not None:
				favorite_query = favorite_query.filter(location_id=location_id)
			favorite_query.delete()
			detail = 'Business removed from favorites.'

		response_payload = build_account_response(request.user, portal, token=request.auth)
		response_payload['detail'] = detail
		return Response(response_payload)


class CustomerPreferencesView(APIView):
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]
	throttle_classes = [UserMutationRateThrottle]

	def get(self, request):
		if infer_portal_for_user(request.user, request.query_params.get('portal')) != 'customer':
			return Response({'detail': 'Customer accounts only.'}, status=status.HTTP_403_FORBIDDEN)
		get_or_create_account_profile(request.user)
		payload = build_account_response(request.user, 'customer', token=request.auth)
		include_all_businesses = str(request.query_params.get('include_all_businesses') or '').strip().lower() in {'1', 'true', 'yes'}
		payload['preference_businesses'] = get_preference_business_options(None, only_with_deals=not include_all_businesses)
		return Response(payload)

	def post(self, request):
		if infer_portal_for_user(request.user, request.data.get('portal')) != 'customer':
			return Response({'detail': 'Customer accounts only.'}, status=status.HTTP_403_FORBIDDEN)
		serializer = CustomerPreferencesSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		try:
			save_customer_preferences(request.user, serializer.validated_data)
		except ValueError as error:
			return Response({'detail': str(error)}, status=status.HTTP_400_BAD_REQUEST)
		get_or_create_account_profile(request.user)
		payload = build_account_response(request.user, 'customer', token=request.auth)
		payload['preference_businesses'] = get_preference_business_options(None)
		payload['detail'] = 'Preferences saved.'
		return Response(payload)


class ProcessDueHappyHourNotificationsView(APIView):
	authentication_classes = []
	permission_classes = []

	def get(self, request, secret):
		expected_secret = str(getattr(settings, 'HAPPY_HOUR_NOTIFICATION_SECRET', '') or '').strip()
		if not expected_secret or not secrets.compare_digest(str(secret or ''), expected_secret):
			return Response({'detail': 'Not found.'}, status=status.HTTP_404_NOT_FOUND)
		return Response(process_due_happy_hour_notifications())


class DirectMessageThreadsView(APIView):
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]
	throttle_classes = [DirectMessageSendRateThrottle]

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
			read_only_reason = _get_direct_message_thread_read_only_reason(thread)
			if read_only_reason:
				return Response({'detail': read_only_reason}, status=status.HTTP_403_FORBIDDEN)
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

		if message_image is not None:
			try:
				moderate_uploaded_image(message_image, surface='direct_message_image')
			except ImageModerationUnavailable as error:
				return Response({'detail': str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
			except ImageModerationRejected as error:
				return Response({'detail': str(error)}, status=status.HTTP_400_BAD_REQUEST)

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
		sender_is_customer = request.user.id == thread.customer_id
		recipient_id = thread.business_claim.claimant_id if sender_is_customer else thread.customer_id
		business_name = str(thread.business_claim.listing_snapshot.name or '').strip() or 'Business'
		if sender_is_customer or should_send_direct_message_notification(thread.customer, thread.business_claim.listing_snapshot.listing_slug):
			send_push_notifications_for_direct_message(
				[recipient_id],
				thread_id=thread.id,
				listing_slug=thread.business_claim.listing_snapshot.listing_slug,
				portal='business' if sender_is_customer else 'customer',
				title=request.user.username if sender_is_customer else f'Message from {business_name}',
				message='Sent A Photo.' if message.image else (message.body or 'Sent You A Message.'),
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
			'business_claim__claimant',
			'business_claim__membership',
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
			'business_claim__claimant',
			'business_claim__membership',
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
				'business_claim__claimant',
				'business_claim__membership',
				'customer',
			).filter(
				id=thread_id,
				business_claim__membership__is_active=True,
				business_claim__membership__user=request.user,
			).distinct().first()
		else:
			thread = BusinessDirectMessageThread.objects.select_related(
				'business_claim__listing_snapshot',
				'business_claim__claimant',
				'business_claim__membership',
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


class DirectMessageImageView(APIView):
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def get(self, request, message_id):
		message = BusinessDirectMessage.objects.select_related(
			'thread__business_claim__membership',
			'thread__business_claim__claimant',
			'thread__customer',
		).filter(id=message_id).first()
		if message is None:
			raise Http404('Direct message image not found.')

		thread = message.thread
		if thread is None or not self._user_can_access_thread(request.user, thread):
			raise Http404('Direct message image not found.')

		if not message.image:
			raise Http404('Direct message image not found.')

		if message.image_has_expired():
			_delete_expired_direct_message_image(message)
			raise Http404('Direct message image has expired.')

		file_handle = message.image.open('rb')
		content_type = mimetypes.guess_type(str(message.image.name or ''))[0] or 'application/octet-stream'
		response = FileResponse(file_handle, content_type=content_type)
		response['Cache-Control'] = 'private, max-age=300'
		return response

	def _user_can_access_thread(self, user, thread):
		if thread.customer_id == user.id:
			return _customer_can_access_direct_message_thread(user, thread)

		return BusinessDirectMessageThread.objects.filter(
			id=thread.id,
			business_claim__membership__is_active=True,
			business_claim__membership__user=user,
		).exists()


class DirectMessageBlocksView(APIView):
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def get(self, request):
		portal = infer_portal_for_user(request.user, request.query_params.get('portal'))
		if portal not in {'customer', 'business'}:
			return Response({'detail': 'Sign in with a customer or business account to manage direct message restrictions.'}, status=status.HTTP_403_FORBIDDEN)
		return Response(build_account_response(request.user, portal, token=request.auth))

	def post(self, request):
		serializer = DirectMessageBlockSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		portal = infer_portal_for_user(request.user, serializer.validated_data.get('portal'))
		if portal == 'customer':
			thread = BusinessDirectMessageThread.objects.select_related('business_claim__listing_snapshot').filter(
				id=serializer.validated_data.get('thread_id'),
				customer=request.user,
			).first()
			if thread is None or not _customer_can_access_direct_message_thread(request.user, thread):
				return Response({'detail': 'That direct message thread could not be found.'}, status=status.HTTP_404_NOT_FOUND)

			BusinessDirectMessageBlock.objects.update_or_create(
				business_claim=thread.business_claim,
				customer=request.user,
				defaults={'blocked_by': request.user},
			)
			response_payload = build_account_response(request.user, portal, token=request.auth)
			response_payload['detail'] = f'Direct messaging blocked for {thread.business_claim.listing_snapshot.name}.'
			return Response(response_payload)

		if portal != 'business':
			return Response({'detail': 'Only business accounts can block customer direct messages.'}, status=status.HTTP_403_FORBIDDEN)
		customer_username = str(serializer.validated_data.get('customer_username') or '').strip()
		if not customer_username:
			return Response({'customer_username': ['Enter the customer username to block.']}, status=status.HTTP_400_BAD_REQUEST)

		membership = request.user.business_memberships.select_related('claim').filter(is_active=True).first()
		if membership is None:
			return Response({'detail': 'An approved business membership is required before blocking direct messages.'}, status=status.HTTP_400_BAD_REQUEST)

		customer = User.objects.filter(username__iexact=customer_username).first()
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
		if portal == 'customer':
			deleted_count, _ = BusinessDirectMessageBlock.objects.filter(
				id=block_id,
				customer=request.user,
				blocked_by=request.user,
			).delete()
			if not deleted_count:
				return Response({'detail': 'That direct message block could not be found.'}, status=status.HTTP_404_NOT_FOUND)

			response_payload = build_account_response(request.user, portal, token=request.auth)
			response_payload['detail'] = 'Business unblocked from direct messages.'
			return Response(response_payload)

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
		FavoriteBusinessPushDevice.objects.filter(user=request.user, expo_push_token=push_token).exclude(installation_id=installation_id).delete()
		FavoriteBusinessPushDevice.objects.update_or_create(
			user=request.user,
			installation_id=installation_id,
			defaults={
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


class ContentReportView(generics.GenericAPIView):
	serializer_class = ContentReportSerializer
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]
	throttle_classes = [ContentReportRateThrottle]
	parser_classes = [MultiPartParser, FormParser, JSONParser]

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		validated_data = serializer.validated_data
		target_type = validated_data['target_type']
		screenshot = validated_data.get('screenshot')
		report_kwargs = {
			'reporter': request.user,
			'reporter_username': request.user.username,
			'reporter_email': request.user.email,
			'target_type': target_type,
			'reason': validated_data['reason'],
			'details': validated_data.get('details', ''),
			'business_name': validated_data.get('business_name', ''),
		}

		if target_type == ContentReport.TargetType.BUSINESS_PROFILE:
			listing_slug = validated_data.get('listing_slug', '')
			if not listing_slug:
				return Response({'listing_slug': ['A business profile report requires a listing slug.']}, status=status.HTTP_400_BAD_REQUEST)
			place_payload = get_source_place_payload(listing_slug)
			listing_snapshot = ListingSnapshot.objects.filter(listing_slug=listing_slug).first() if place_payload is None else None
			if place_payload is None and listing_snapshot is None:
				return Response({'detail': 'That business profile could not be found.'}, status=status.HTTP_404_NOT_FOUND)
			report_kwargs['listing_slug'] = listing_slug
			report_kwargs['business_name'] = (place_payload or {}).get('name') or getattr(listing_snapshot, 'name', '') or report_kwargs['business_name']
		elif target_type == ContentReport.TargetType.BUSINESS_POST:
			post = BusinessPost.objects.select_related('listing_snapshot').filter(pk=validated_data.get('post_id')).first()
			if post is None:
				return Response({'detail': 'That business post could not be found.'}, status=status.HTTP_404_NOT_FOUND)
			report_kwargs['business_post'] = post
			report_kwargs['business_name'] = report_kwargs['business_name'] or post.listing_snapshot.name
		elif target_type == ContentReport.TargetType.DIRECT_MESSAGE:
			message = BusinessDirectMessage.objects.select_related(
				'sender',
				'thread__business_claim__listing_snapshot',
				'thread__customer',
			).filter(pk=validated_data.get('message_id')).first()
			if message is None:
				return Response({'detail': 'That direct message could not be found.'}, status=status.HTTP_404_NOT_FOUND)
			can_access_message = message.thread.customer_id == request.user.id or BusinessMembership.objects.filter(
				claim=message.thread.business_claim,
				user=request.user,
				is_active=True,
			).exists()
			if not can_access_message:
				return Response({'detail': 'That direct message could not be found.'}, status=status.HTTP_404_NOT_FOUND)
			reported_user = message.sender
			recipient = message.thread.customer if reported_user.id != message.thread.customer_id else message.thread.business_claim.claimant
			report_kwargs['direct_message'] = message
			report_kwargs['business_name'] = report_kwargs['business_name'] or message.thread.business_claim.listing_snapshot.name
			report_kwargs['reported_user_username'] = reported_user.username
			report_kwargs['reported_user_email'] = reported_user.email
			report_kwargs['reported_user_role'] = 'customer' if reported_user.id == message.thread.customer_id else 'business'
			report_kwargs['recipient_username'] = recipient.username
			report_kwargs['recipient_email'] = recipient.email
			report_kwargs['reported_message'] = message.body or ('[Image message]' if message.image else '')
			report_kwargs['reported_message_created_at'] = message.created_at

		duplicate_query = ContentReport.objects.filter(reporter=request.user, target_type=target_type)
		if target_type == ContentReport.TargetType.BUSINESS_PROFILE:
			duplicate_query = duplicate_query.filter(listing_slug=report_kwargs['listing_slug'])
		elif target_type == ContentReport.TargetType.BUSINESS_POST:
			duplicate_query = duplicate_query.filter(business_post=report_kwargs['business_post'])
		else:
			duplicate_query = duplicate_query.filter(direct_message=report_kwargs['direct_message'])
		if duplicate_query.exists():
			return Response({'detail': 'You have already reported this content. Our team will review it.'}, status=status.HTTP_400_BAD_REQUEST)

		report = ContentReport(**report_kwargs)
		report.full_clean()
		try:
			report.save()
			if screenshot is not None:
				report.screenshot = screenshot
				report.save(update_fields=['screenshot', 'updated_at'])
		except Exception:
			report.delete()
			raise
		send_content_report_support_email_safely(report)
		return Response({'detail': 'Thanks. Your report was sent to the DiningDealz review team.'}, status=status.HTTP_201_CREATED)


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
		deactivate_account_for_retained_direct_messages(user)
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


class PasswordResetView(generics.GenericAPIView):
	serializer_class = PasswordResetConfirmSerializer
	permission_classes = []
	authentication_classes = []

	def get(self, request, token):
		from .models import AccountProfile
		profile = AccountProfile.objects.select_related('user').filter(password_reset_token=token).first()
		if profile is None or not profile.password_reset_token_is_active():
			return HttpResponse(self._build_html(title='Password reset link is invalid or expired.', message='', token='', error=True), status=404)
		return HttpResponse(self._build_html(title='Reset your password', message='Enter a new password for your account.', token=token))

	def post(self, request, token):
		wants_json = request.content_type == 'application/json' or 'application/json' in request.headers.get('Accept', '')
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
			if wants_json:
				return Response({'detail': 'Password updated successfully.'})
			return HttpResponse(self._build_html(title='Password updated successfully.', message='You can return to the app and sign in with your new password.', token='', success=True))

		if wants_json:
			return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

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


class LogoutView(APIView):
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def post(self, request):
		ProfileAuthToken.objects.filter(pk=getattr(request.auth, 'pk', None), user=request.user).delete()
		return Response({'detail': 'Signed out.'})
