from datetime import datetime, timezone as datetime_timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from places.models import AccountProfile, FavoriteBusiness, FavoriteBusinessNotification, FavoriteBusinessPushDevice, HappyHourNotificationDelivery, ProfileAuthToken
from places.services.happy_hour_notifications import process_due_happy_hour_notifications


class CustomerPreferenceApiTests(APITestCase):
	def setUp(self):
		self.user = User.objects.create_user(username='preference-user', email='preference@example.com', password='test-pass-123')
		AccountProfile.objects.create(user=self.user, email_verified_at=timezone.now())
		self.token = ProfileAuthToken.objects.create(user=self.user)
		self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')
		self.place_payload = {
			'slug': 'yard-house',
			'name': 'Yard House',
			'locations': [{
				'id': 71,
				'name': 'Yard House',
				'city': 'oxnard',
				'city_label': 'Oxnard',
				'venue_type': 'bar',
				'venue_type_label': 'Bar',
				'address_line_1': '501 Collection Blvd',
				'website_url': 'https://example.com/yard-house',
				'deal_count': 1,
				'has_deals': True,
				'deals': [],
			}],
		}

	@patch('places.services.source_listings.get_source_place_payloads')
	@patch('places.services.customer_preferences.get_source_place_payload')
	@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
	def test_preferences_save_exact_location_and_notification_flags(self, mock_get_source_place_payload, mock_get_source_place_payloads):
		mock_get_source_place_payload.return_value = self.place_payload
		mock_get_source_place_payloads.return_value = [self.place_payload]

		response = self.client.post(
			reverse('profile-preferences'),
			{
				'action': 'complete',
				'preferred_cities': ['oxnard'],
				'preferred_days': [4, 5],
				'preferred_time_periods': ['afternoon', 'evening'],
				'businesses': [{
					'slug': 'yard-house',
					'location_id': 71,
					'profile_updates_enabled': True,
					'happy_hour_notifications_enabled': True,
					'deal_updates_enabled': False,
					'direct_message_notifications_enabled': False,
				}],
			},
			format='json',
		)

		self.assertEqual(response.status_code, 200)
		self.assertTrue(response.data['preference_onboarding_completed'])
		self.assertEqual(response.data['preferred_cities'], ['oxnard'])
		favorite = FavoriteBusiness.objects.get(user=self.user)
		self.assertEqual(favorite.location_id, 71)
		self.assertTrue(favorite.happy_hour_notifications_enabled)
		self.assertFalse(favorite.deal_updates_enabled)
		self.assertFalse(favorite.direct_message_notifications_enabled)


class HappyHourNotificationProcessorTests(APITestCase):
	@override_settings(EXPO_PUSH_NOTIFICATIONS_ENABLED=True)
	@patch('places.services.happy_hour_notifications.send_push_notifications_for_favorite_business_event')
	@patch('places.services.happy_hour_notifications.get_source_place_payloads')
	def test_processor_sends_once_for_current_occurrence(self, mock_get_source_place_payloads, mock_send_push):
		user = User.objects.create_user(username='happy-hour-user', email='happy-hour@example.com', password='test-pass-123')
		AccountProfile.objects.create(
			user=user,
			email_verified_at=timezone.now(),
			preference_onboarding_completed=True,
			preferred_days=[4],
			preferred_time_periods=['afternoon'],
		)
		FavoriteBusiness.objects.create(
			user=user,
			listing_slug='yard-house',
			location_id=71,
			name='Yard House',
			city='oxnard',
			happy_hour_notifications_enabled=True,
			profile_updates_enabled=True,
			deal_updates_enabled=True,
			direct_message_notifications_enabled=True,
		)
		mock_get_source_place_payloads.return_value = [{
			'slug': 'yard-house',
			'locations': [{
				'id': 71,
				'name': 'Yard House',
				'deals': [{
					'id': 91,
					'title': 'Afternoon specials',
					'is_active': True,
					'happy_hours': [{
						'id': 92,
						'weekday': 4,
						'start_time': '15:00',
						'end_time': '18:00',
						'all_day': False,
					}],
				}],
			}],
		}]
		reference_time = datetime(2026, 8, 14, 22, 5, tzinfo=datetime_timezone.utc)

		first_result = process_due_happy_hour_notifications(reference_time=reference_time)
		second_result = process_due_happy_hour_notifications(reference_time=reference_time)

		self.assertEqual(first_result['notifications_sent'], 1)
		self.assertEqual(second_result['notifications_sent'], 0)
		self.assertEqual(HappyHourNotificationDelivery.objects.filter(user=user).count(), 1)
		self.assertEqual(FavoriteBusinessNotification.objects.filter(user=user, event_type='happy_hour').count(), 1)
		mock_send_push.assert_called_once()
