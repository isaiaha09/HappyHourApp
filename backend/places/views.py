from django.contrib.auth.models import User
from django.conf import settings
from django.http import Http404, HttpResponse
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework import generics, status
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import ProfileTokenAuthentication
from .serializers import (
	BusinessLocationTrackingPreferenceSerializer,
	BusinessLocationUpdateSerializer,
	ClaimedBusinessSignupSerializer,
	CustomerSignupSerializer,
	DealSerializer,
	EmailVerificationCodeSerializer,
	FavoriteBusinessToggleSerializer,
	InformalBusinessSignupSerializer,
	LoginSerializer,
	PasswordResetConfirmSerializer,
	PasswordResetRequestSerializer,
	ProfileDashboardUpdateSerializer,
	ManualBusinessSignupSerializer,
	PlaceDetailSerializer,
	PlaceListSerializer,
	ResendEmailVerificationCodeSerializer,
	TwoFactorCodeSerializer,
	UsernameReminderSerializer,
	build_signup_request_data,
	sync_listing_snapshot_from_place_payload,
)
from .services.account_profiles import build_account_response, build_email_verification_challenge, get_business_access_hold_claim, get_or_create_account_profile, get_or_create_profile_token, infer_portal_for_user, send_business_claim_received_email, send_password_reset_email, send_username_reminder_email, send_verification_email
from .models import FavoriteBusiness, VenueType
from .services.source_listings import get_source_deal_payloads, get_source_place_payload, get_source_place_payloads, load_source_records


class SourcePlacePagination(PageNumberPagination):
	page_size = 100
	page_size_query_param = 'page_size'
	max_page_size = 500


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

	def get(self, request, slug):
		payload = get_source_place_payload(slug)
		if payload is None:
			raise Http404('Place not found.')

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
		profile = get_or_create_account_profile(user)
		if getattr(user, '_signup_reused_existing_user', False) and profile.email_is_verified:
			send_business_claim_received_email(user, claim)
			payload = build_account_response(user, 'business', claim=claim, token=None)
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
		profile.business_location_tracking_enabled = serializer.validated_data['enabled']
		profile.save(update_fields=['business_location_tracking_enabled', 'updated_at'])

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
