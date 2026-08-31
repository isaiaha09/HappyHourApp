from datetime import timedelta
from hashlib import sha256
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.test import APIRequestFactory

from .authentication import ProfileTokenAuthentication
from .models import ProfileAuthToken
from .services.account_profiles import get_or_create_profile_token
from .services.importers.base import BaseHtmlImporter
from .views import (
	BusinessLocationTrackingPreferenceView,
	BusinessLocationUpdateView,
	BusinessSignupView,
	ConfirmTwoFactorView,
	ContactSupportView,
	ContentReportView,
	CustomerPreferencesView,
	CustomerSignupView,
	CurrentHappyHoursView,
	DeleteAccountView,
	DealListView,
	DirectMessageBlockDetailView,
	DirectMessageBlocksView,
	DirectMessageImageView,
	DirectMessageThreadDetailView,
	DirectMessageThreadsView,
	DisableTwoFactorView,
	DiscoveryEnrichmentStatusView,
	FeedEngagementView,
	FeedImpressionView,
	FavoriteBusinessNotificationsView,
	FavoriteBusinessView,
	HealthCheckView,
	HomeFeedView,
	InformalBusinessSignupView,
	LiveLocationPlaceListView,
	LoginView,
	LogoutView,
	ManualBusinessSignupView,
	PasswordResetRequestView,
	PasswordResetView,
	PlaceDetailView,
	PlaceListView,
	ProcessDueHappyHourNotificationsView,
	ProfileDashboardView,
	PushDeviceRegistrationView,
	ResendEmailVerificationCodeView,
	ResendVerificationEmailView,
	ToggleTwoFactorView,
	UsernameReminderView,
	VerifyEmailCodeView,
)


User = get_user_model()


class ProfileTokenSecurityTests(TestCase):
	def setUp(self):
		self.user = User.objects.create_user(username='security-user', password='safe-password-123')

	def test_profile_tokens_are_hashed_and_expiring(self):
		token = ProfileAuthToken.objects.create(user=self.user)
		raw_token = token.key

		token.refresh_from_db()

		self.assertTrue(raw_token)
		self.assertNotEqual(token.token_hash, raw_token)
		self.assertEqual(token.token_hash, sha256(raw_token.encode('utf-8')).hexdigest())
		self.assertGreater(token.expires_at, timezone.now())

	def test_expired_profile_tokens_are_rejected_and_deleted(self):
		token = ProfileAuthToken.objects.create(user=self.user)
		raw_token = token.key
		token.expires_at = timezone.now() - timedelta(seconds=1)
		token.save(update_fields=['expires_at'])
		request = APIRequestFactory().get('/', HTTP_AUTHORIZATION=f'Token {raw_token}')

		with self.assertRaises(AuthenticationFailed):
			ProfileTokenAuthentication().authenticate(request)

		self.assertFalse(ProfileAuthToken.objects.filter(pk=token.pk).exists())

	def test_sign_in_token_rotation_revokes_previous_tokens(self):
		old_token = ProfileAuthToken.objects.create(user=self.user)

		new_token = get_or_create_profile_token(self.user)

		self.assertNotEqual(old_token.pk, new_token.pk)
		self.assertFalse(ProfileAuthToken.objects.filter(pk=old_token.pk).exists())
		self.assertEqual(ProfileAuthToken.objects.filter(user=self.user).count(), 1)
		self.assertTrue(new_token.key)


class SourceFetchSecurityTests(TestCase):
	class Importer(BaseHtmlImporter):
		source_name = 'security-test'
		source_url = 'https://example.com/source'

		def parse_html(self, html):
			return html

	class Response:
		def __init__(self, chunks, status_code=200, headers=None):
			self._chunks = chunks
			self.status_code = status_code
			self.headers = headers or {}
			self.encoding = 'utf-8'
			self.closed = False

		def iter_content(self, chunk_size=65536):
			return iter(self._chunks)

		def raise_for_status(self):
			return None

		def close(self):
			self.closed = True

	class Session:
		def __init__(self, response):
			self.response = response
			self.calls = []

		def get(self, url, headers=None, timeout=None):
			self.calls.append(url)
			return self.response

	def test_private_literal_source_hosts_are_blocked_before_fetch(self):
		session = self.Session(self.Response([b'ok']))
		importer = self.Importer(session=session)

		with self.assertRaises(ValueError):
			importer.fetch_html('http://127.0.0.1/internal', use_cache=False)

		self.assertEqual(session.calls, [])

	@override_settings(SOURCE_FETCH_MAX_HTML_BYTES=5)
	def test_source_responses_are_streamed_with_a_hard_size_limit(self):
		session = self.Session(self.Response([b'abc', b'def']))
		importer = self.Importer(session=session)

		with self.assertRaises(ValueError):
			importer.fetch_html(use_cache=False)

	@override_settings(SOURCE_FETCH_MAX_REDIRECTS=3)
	def test_redirect_destinations_are_revalidated(self):
		response = self.Response([], status_code=302, headers={'Location': 'http://127.0.0.1/private'})
		session = self.Session(response)
		importer = self.Importer(session=session)

		with self.assertRaises(ValueError):
			importer.fetch_html(use_cache=False)

		self.assertEqual(session.calls, ['https://example.com/source'])


class PermissionCoverageTests(TestCase):
	PUBLIC_VIEWS = (
		HealthCheckView,
		DiscoveryEnrichmentStatusView,
		PlaceListView,
		CurrentHappyHoursView,
		PlaceDetailView,
		LiveLocationPlaceListView,
		DealListView,
		HomeFeedView,
		FeedImpressionView,
		FeedEngagementView,
		CustomerSignupView,
		LoginView,
		UsernameReminderView,
		PasswordResetRequestView,
		BusinessSignupView,
		ManualBusinessSignupView,
		InformalBusinessSignupView,
		VerifyEmailCodeView,
		ResendEmailVerificationCodeView,
		ProcessDueHappyHourNotificationsView,
		PasswordResetView,
	)
	PRIVATE_VIEWS = (
		ProfileDashboardView,
		BusinessLocationUpdateView,
		BusinessLocationTrackingPreferenceView,
		ResendVerificationEmailView,
		FavoriteBusinessView,
		CustomerPreferencesView,
		DirectMessageThreadsView,
		DirectMessageThreadDetailView,
		DirectMessageImageView,
		DirectMessageBlocksView,
		DirectMessageBlockDetailView,
		PushDeviceRegistrationView,
		FavoriteBusinessNotificationsView,
		ContentReportView,
		ContactSupportView,
		DeleteAccountView,
		ToggleTwoFactorView,
		ConfirmTwoFactorView,
		DisableTwoFactorView,
		LogoutView,
	)

	def test_public_and_private_drf_views_have_explicit_permissions(self):
		for view_class in self.PUBLIC_VIEWS:
			self.assertEqual(view_class.permission_classes, [AllowAny], view_class.__name__)

		for view_class in self.PRIVATE_VIEWS:
			self.assertEqual(view_class.permission_classes, [IsAuthenticated], view_class.__name__)


class NotificationProcessorSecurityTests(TestCase):
	@override_settings(HAPPY_HOUR_NOTIFICATION_SECRET='rotated-cron-secret')
	@patch('places.views.process_due_happy_hour_notifications', return_value={'processed': 0})
	def test_notification_secret_is_header_only(self, process_notifications):
		url = '/api/internal/process-due-happy-hour-notifications/'

		url_secret_response = self.client.post(f'{url}?secret=rotated-cron-secret')
		header_response = self.client.post(url, HTTP_AUTHORIZATION='Bearer rotated-cron-secret')

		self.assertEqual(url_secret_response.status_code, 404)
		self.assertEqual(header_response.status_code, 200)
		process_notifications.assert_called_once_with()

	@override_settings(HAPPY_HOUR_NOTIFICATION_SECRET='rotated-cron-secret')
	@patch('places.views.process_due_happy_hour_notifications', return_value={'processed': 0})
	def test_existing_uptime_robot_head_path_remains_authenticated(self, process_notifications):
		legacy_url = '/api/internal/process-due-happy-hour-notifications/rotated-cron-secret/'
		base_url = '/api/internal/process-due-happy-hour-notifications/'

		wrong_secret_response = self.client.head('/api/internal/process-due-happy-hour-notifications/wrong-secret/')
		query_secret_response = self.client.head(f'{base_url}?secret=rotated-cron-secret')
		post_to_legacy_response = self.client.post(legacy_url)
		header_post_to_legacy_response = self.client.post(legacy_url, HTTP_AUTHORIZATION='Bearer rotated-cron-secret')
		header_head_response = self.client.head(base_url, HTTP_AUTHORIZATION='Bearer rotated-cron-secret')
		valid_response = self.client.head(legacy_url)

		self.assertEqual(wrong_secret_response.status_code, 404)
		self.assertEqual(query_secret_response.status_code, 404)
		self.assertEqual(post_to_legacy_response.status_code, 404)
		self.assertEqual(header_post_to_legacy_response.status_code, 404)
		self.assertEqual(header_head_response.status_code, 404)
		self.assertEqual(valid_response.status_code, 200)
		process_notifications.assert_called_once_with()
