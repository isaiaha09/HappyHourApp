from django.urls import path

from .views import (
    BusinessSignupView,
    CustomerSignupView,
    DealListView,
    HealthCheckView,
    LoginView,
    ManualBusinessSignupView,
    PlaceDetailView,
    PlaceListView,
)


urlpatterns = [
    path('health/', HealthCheckView.as_view(), name='health-check'),
    path('places/', PlaceListView.as_view(), name='place-list'),
    path('places/<slug:slug>/', PlaceDetailView.as_view(), name='place-detail'),
    path('deals/', DealListView.as_view(), name='deal-list'),
    path('profiles/login/', LoginView.as_view(), name='profile-login'),
    path('profiles/customer-signup/', CustomerSignupView.as_view(), name='customer-signup'),
    path('profiles/business-signup/', BusinessSignupView.as_view(), name='business-signup'),
    path('profiles/manual-business-signup/', ManualBusinessSignupView.as_view(), name='manual-business-signup'),
]