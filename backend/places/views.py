from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.http import Http404

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
from .services.source_listings import get_source_deal_payloads, get_source_place_payload, get_source_place_payloads


class HealthCheckView(APIView):
	def get(self, request):
		return Response({'status': 'ok', 'service': 'happyhour-backend'})


class PlaceListView(generics.GenericAPIView):
	serializer_class = PlaceListSerializer

	def get(self, request):
		city = self.request.query_params.get('city')
		venue_type = self.request.query_params.get('venue_type')
		payloads = get_source_place_payloads(city=city, venue_type=venue_type)

		page = self.paginate_queryset(payloads)
		if page is not None:
			serializer = self.get_serializer(page, many=True)
			return self.get_paginated_response(serializer.data)

		serializer = self.get_serializer(payloads, many=True)
		return Response(serializer.data)


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
		return Response(serializer.to_representation(user), status=status.HTTP_201_CREATED)


class LoginView(generics.GenericAPIView):
	serializer_class = LoginSerializer

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		return Response(serializer.to_representation(serializer.validated_data['user']))


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
		return Response(serializer.to_representation(user), status=status.HTTP_201_CREATED)


class ManualBusinessSignupView(generics.GenericAPIView):
	serializer_class = ManualBusinessSignupSerializer

	def post(self, request):
		serializer = self.get_serializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		user = serializer.save()
		return Response(serializer.to_representation(user), status=status.HTTP_201_CREATED)
