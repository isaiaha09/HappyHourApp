from django.http import Http404, HttpResponse
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from .authentication import ProfileTokenAuthentication
from .serializers import (
	ClaimedBusinessSignupSerializer,
	CustomerSignupSerializer,
	DealSerializer,
	LoginSerializer,
	ManualBusinessSignupSerializer,
	PlaceDetailSerializer,
	PlaceListSerializer,
	sync_listing_snapshot_from_place_payload,
)
from .services.account_profiles import build_account_response, get_or_create_account_profile, get_or_create_profile_token, infer_portal_for_user, send_verification_email
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
		profile = get_or_create_account_profile(user)
		send_verification_email(user, profile)
		token = get_or_create_profile_token(user)
		return Response(build_account_response(user, 'customer', token=token), status=status.HTTP_201_CREATED)


class LoginView(generics.GenericAPIView):
	serializer_class = LoginSerializer

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		user = serializer.validated_data['user']
		portal = serializer.validated_data['portal']
		token = get_or_create_profile_token(user)
		return Response(build_account_response(user, portal, token=token))


class BusinessSignupView(generics.GenericAPIView):
	serializer_class = ClaimedBusinessSignupSerializer

	def post(self, request):
		payload = dict(request.data)
		business_slug = payload.get('business_slug')
		place_payload = get_source_place_payload(business_slug)
		if place_payload is None:
			return Response({'business_slug': ['Business listing not found.']}, status=status.HTTP_400_BAD_REQUEST)

		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		serializer.validated_data['listing_snapshot'] = sync_listing_snapshot_from_place_payload(place_payload)
		user = serializer.save()
		claim = getattr(user, '_created_business_claim', None)
		profile = get_or_create_account_profile(user)
		send_verification_email(user, profile)
		token = get_or_create_profile_token(user)
		return Response(build_account_response(user, 'business', claim=claim, token=token), status=status.HTTP_201_CREATED)


class ManualBusinessSignupView(generics.GenericAPIView):
	serializer_class = ManualBusinessSignupSerializer

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		user = serializer.save()
		claim = getattr(user, '_created_business_claim', None)
		profile = get_or_create_account_profile(user)
		send_verification_email(user, profile)
		token = get_or_create_profile_token(user)
		return Response(build_account_response(user, 'business', claim=claim, token=token), status=status.HTTP_201_CREATED)


class ProfileDashboardView(APIView):
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def get(self, request):
		portal = infer_portal_for_user(request.user, request.query_params.get('portal'))
		return Response(build_account_response(request.user, portal, token=request.auth))


class ResendVerificationEmailView(APIView):
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def post(self, request):
		profile = get_or_create_account_profile(request.user)
		if profile.email_is_verified:
			return Response({'detail': 'Email is already verified.'})
		send_verification_email(request.user, profile)
		return Response({'detail': 'Verification email sent.'})


class ToggleTwoFactorView(APIView):
	authentication_classes = [ProfileTokenAuthentication]
	permission_classes = [IsAuthenticated]

	def post(self, request):
		enabled = bool(request.data.get('enabled', False))
		profile = get_or_create_account_profile(request.user)
		profile.two_factor_enabled = enabled
		profile.save(update_fields=['two_factor_enabled', 'updated_at'])
		portal = infer_portal_for_user(request.user, request.data.get('portal'))
		return Response(build_account_response(request.user, portal, token=request.auth))


class VerifyEmailView(APIView):
	permission_classes = []
	authentication_classes = []

	def get(self, request, token):
		profile = get_or_create_account_profile if False else None
		from .models import AccountProfile
		account_profile = AccountProfile.objects.select_related('user').filter(email_verification_token=token).first()
		if account_profile is None:
			return HttpResponse('<h1>Verification link is invalid or expired.</h1>', status=404)
		account_profile.mark_email_verified()
		return HttpResponse('<h1>Email verified successfully.</h1><p>You can return to HappyHourApp and refresh your profile dashboard.</p>')
