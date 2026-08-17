from datetime import datetime, timezone as datetime_timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo

from django.contrib.auth.models import User
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase

from places.models import AccountProfile, FavoriteBusiness, FavoriteBusinessNotification, FavoriteBusinessPushDevice, HappyHourNotificationDelivery, ProfileAuthToken
from places.services.customer_preferences import get_preference_business_options, save_customer_preferences
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
				'direct_message_notifications_enabled': False,
				'business_updates_notifications_enabled': True,
				'happy_hour_notifications_enabled': True,
				'businesses': [{
					'slug': 'yard-house',
					'location_id': 71,
					'profile_updates_enabled': False,
					'happy_hour_notifications_enabled': False,
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
		self.assertTrue(favorite.deal_updates_enabled)
		self.assertFalse(favorite.direct_message_notifications_enabled)

	@patch('places.services.customer_preferences.get_source_place_payloads')
	@patch('places.services.customer_preferences.get_source_place_payload')
	def test_preferences_save_ignores_stale_and_non_happy_hour_favorites(self, mock_get_source_place_payload, mock_get_source_place_payloads):
		non_happy_hour_payload = {
			'slug': 'huh-unknown',
			'locations': [{
				'id': 99,
				'name': 'HUH',
				'city': 'camarillo',
				'city_label': 'Camarillo',
				'deals': [],
			}],
		}
		mock_get_source_place_payload.side_effect = lambda slug: {
			'yard-house': self.place_payload,
			'huh-unknown': non_happy_hour_payload,
		}.get(slug)
		mock_get_source_place_payloads.return_value = [self.place_payload, non_happy_hour_payload]
		FavoriteBusiness.objects.create(
			user=self.user,
			listing_slug='huh-unknown',
			location_id=99,
			name='HUH',
			city='camarillo',
			happy_hour_notifications_enabled=True,
		)
		FavoriteBusiness.objects.create(
			user=self.user,
			listing_slug='removed-business',
			location_id=123,
			name='Removed Business',
			happy_hour_notifications_enabled=True,
		)

		save_customer_preferences(self.user, {
			'action': 'complete',
			'preferred_cities': ['camarillo', 'oxnard'],
			'preferred_days': [4],
			'preferred_time_periods': ['afternoon'],
			'notifications_paused': False,
			'direct_message_notifications_enabled': True,
			'business_updates_notifications_enabled': True,
			'happy_hour_notifications_enabled': True,
			'businesses': [
				{'slug': 'yard-house', 'location_id': 71},
				{'slug': 'huh-unknown', 'location_id': 99},
				{'slug': 'removed-business', 'location_id': 123},
			],
		})

		valid_favorite = FavoriteBusiness.objects.get(user=self.user, listing_slug='yard-house')
		non_happy_hour_favorite = FavoriteBusiness.objects.get(user=self.user, listing_slug='huh-unknown')
		stale_favorite = FavoriteBusiness.objects.get(user=self.user, listing_slug='removed-business')
		self.assertTrue(valid_favorite.happy_hour_notifications_enabled)
		self.assertFalse(non_happy_hour_favorite.happy_hour_notifications_enabled)
		self.assertFalse(stale_favorite.happy_hour_notifications_enabled)

	@patch('places.services.customer_preferences.get_source_place_payloads')
	def test_preference_business_options_only_include_happy_hour_locations(self, mock_get_source_place_payloads):
		mock_get_source_place_payloads.return_value = [
			self.place_payload,
			{
				'slug': 'regular-deal-business',
				'locations': [{
					'id': 72,
					'name': 'Regular Deal Business',
					'city': 'oxnard',
					'city_label': 'Oxnard',
					'deals': [{
						'is_active': True,
						'happy_hours': [],
					}],
				}],
			},
		]

		options = get_preference_business_options(['oxnard'])

		self.assertEqual([option['slug'] for option in options], ['yard-house'])
		self.assertTrue(options[0]['has_happy_hours'])


class HappyHourNotificationProcessorTests(APITestCase):
	@override_settings(EXPO_PUSH_NOTIFICATIONS_ENABLED=True)
	@patch('places.services.happy_hour_notifications.send_push_notifications_for_favorite_business_event')
	@patch('places.services.happy_hour_notifications.get_source_place_payloads')
	def test_processor_sends_once_for_current_occurrence(self, mock_get_source_place_payloads, mock_send_push):
		mock_send_push.return_value = 1
		user = User.objects.create_user(username='happy-hour-user', email='happy-hour@example.com', password='test-pass-123')
		AccountProfile.objects.create(
			user=user,
			email_verified_at=timezone.now(),
			preference_onboarding_completed=True,
			preferred_days=[4],
			preferred_time_periods=['afternoon'],
			happy_hour_notifications_enabled=True,
			business_updates_notifications_enabled=True,
			direct_message_notifications_enabled=True,
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
		FavoriteBusiness.objects.create(
			user=user,
			listing_slug='yard-house',
			location_id=72,
			name='Yard House - Ventura',
			city='ventura',
			happy_hour_notifications_enabled=False,
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
		self.assertEqual(first_result['eligible_favorites'], 1)
		self.assertEqual(first_result['push_notifications_delivered'], 1)
		self.assertEqual(second_result['notifications_sent'], 0)
		self.assertEqual(HappyHourNotificationDelivery.objects.filter(user=user).count(), 1)
		self.assertEqual(FavoriteBusinessNotification.objects.filter(user=user, event_type='happy_hour').count(), 1)
		mock_send_push.assert_called_once()

	@override_settings(EXPO_PUSH_NOTIFICATIONS_ENABLED=True)
	@patch('places.services.happy_hour_notifications.send_push_notifications_for_favorite_business_event')
	@patch('places.services.happy_hour_notifications.get_source_place_payloads')
	def test_processor_uses_operating_hours_start_for_all_day_happy_hour(self, mock_get_source_place_payloads, mock_send_push):
		mock_send_push.return_value = 1
		user = User.objects.create_user(username='all-day-happy-hour-user', email='all-day-happy-hour@example.com', password='test-pass-123')
		AccountProfile.objects.create(
			user=user,
			email_verified_at=timezone.now(),
			preference_onboarding_completed=True,
			preferred_days=[4],
			preferred_time_periods=['morning'],
			happy_hour_notifications_enabled=True,
		)
		FavoriteBusiness.objects.create(
			user=user,
			listing_slug='all-day-diner',
			location_id=88,
			name='All Day Diner',
			city='ventura',
			happy_hour_notifications_enabled=True,
		)
		mock_get_source_place_payloads.return_value = [{
			'slug': 'all-day-diner',
			'locations': [{
				'id': 88,
				'name': 'All Day Diner',
				'operating_hours': [{
					'weekday': 4,
					'open_time': '10:00',
					'close_time': '22:00',
				}],
				'deals': [{
					'id': 93,
					'title': 'All day special',
					'is_active': True,
					'happy_hours': [{
						'id': 94,
						'weekday': 4,
						'start_time': '',
						'end_time': '',
						'all_day': True,
					}],
				}],
			}],
		}]

		result = process_due_happy_hour_notifications(reference_time=datetime(2026, 8, 14, 17, 5, tzinfo=datetime_timezone.utc))

		self.assertEqual(result['occurrences_checked'], 1)
		self.assertEqual(result['eligible_favorites'], 1)
		self.assertEqual(result['notifications_sent'], 1)
		mock_send_push.assert_called_once()
