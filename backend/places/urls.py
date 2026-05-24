from django.urls import path

from .views import DealListView, HealthCheckView, PlaceDetailView, PlaceListView


urlpatterns = [
    path('health/', HealthCheckView.as_view(), name='health-check'),
    path('places/', PlaceListView.as_view(), name='place-list'),
    path('places/<slug:slug>/', PlaceDetailView.as_view(), name='place-detail'),
    path('deals/', DealListView.as_view(), name='deal-list'),
]