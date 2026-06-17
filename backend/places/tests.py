import json
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from io import StringIO
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.contrib.admin import helpers
from django.contrib.admin.sites import AdminSite
from django.contrib.messages.storage.fallback import FallbackStorage
from django.conf import settings
from django.core.cache import caches
from django.core import mail
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.exceptions import ValidationError
from django.test import RequestFactory, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from bs4 import BeautifulSoup
import pyotp

from .admin import BusinessAccountAdmin, BusinessClaimAdmin, CustomerAccountAdmin, DeletedBusinessAdmin, ListingSnapshotAdmin, ListingSnapshotAdminForm, ProviderUsageWindowAdmin, _sync_listing_snapshot_from_imported_place
from .admin_site import happyhour_admin_site
from .models import AccountProfile, BusinessAccount, BusinessClaim, BusinessClaimAttachment, BusinessClaimProfileEntry, BusinessMembership, BusinessPost, City, CustomerAccount, DealType, DeletedBusiness, FavoriteBusiness, FeedEngagement, FeedImpression, ListingSnapshot, ProfileAuthToken, ProviderUsageWindow, SponsoredCampaign, VenueType, Weekday
from .services.importers.base import BaseHtmlImporter
from .services.importers.business_websites import BusinessWebsiteImporter
from .services.importers.discovered_json_places import CuratedJsonPlacesImporter, DiscoveryJsonPlacesImporter, load_discovery_json_records, write_discovery_json_records
from .services.deleted_businesses import filter_deleted_business_records
from .services.demo_home_feed import DEMO_HOME_FEED_SOURCE_NAME, get_demo_home_feed_business_specs
from .services.importers.here_places import HerePlacesImporter
from .services.importers.openstreetmap_places import HybridPlacesImporter, OpenStreetMapPlacesImporter
from .services.importers.tomtom_places import TomTomPlacesImporter
from .services.provider_quota import consume_provider_transaction, get_provider_usage_statuses, select_discovery_provider
from .services.importers.yelp_places import YelpFusionPlacesImporter
from .services.importers.types import ImportedDeal, ImportedHappyHour, ImportedOperatingHour, ImportedPlace
from .services.source_listings import _build_deal_identity_key, _build_place_payload, get_source_place_payload, get_source_place_payloads


User = get_user_model()


class StubResponse:
	def __init__(self, text, content=None):
		self.text = text
		self.content = content if content is not None else text.encode('utf-8')

	def raise_for_status(self):
		return None


class CountingSession:
	def __init__(self, html):
		self.html = html
		self.calls = []

	def get(self, url, headers=None, timeout=None):
		self.calls.append({'url': url, 'headers': headers, 'timeout': timeout})
		return StubResponse(self.html)


class DummyImporter(BaseHtmlImporter):
	source_name = 'dummy_source'
	source_url = 'https://example.com/live-feed'

	def parse_html(self, html):
		return html


class PlaceApiTests(APITestCase):
	def setUp(self):
		self.place_payload = {
			'id': 101,
			'name': '805 Tacos',
			'slug': '805-tacos-ventura',
			'city': City.VENTURA,
			'city_label': 'Ventura',
			'venue_type': VenueType.RESTAURANT,
			'venue_type_label': 'Restaurant',
			'address_line_1': '123 Main St',
			'address_line_2': '',
			'neighborhood': '',
			'state': 'CA',
			'postal_code': '93001',
			'latitude': 34.2783,
			'longitude': -119.2931,
			'phone_number': '805-555-0111',
			'website_url': 'https://example.com/805-tacos',
			'image_urls': [],
			'operating_hours': [
				{
					'id': 404,
					'weekday': Weekday.MONDAY,
					'weekday_label': 'Monday',
					'open_time': '11:00',
					'close_time': '21:00',
				},
			],
			'is_active': True,
			'operating_weekdays': [Weekday.MONDAY, Weekday.TUESDAY],
			'deal_weekdays': [Weekday.TUESDAY],
			'is_verified': True,
			'deals': [
				{
					'id': 202,
					'title': 'Taco Tuesday',
					'description': 'Discount tacos and drinks',
					'deal_type': DealType.HAPPY_HOUR,
					'deal_type_label': 'Happy Hour',
					'price_text': '$3 tacos',
					'terms': 'Dine-in only.',
					'is_active': True,
					'starts_on': None,
					'ends_on': None,
					'place_name': '805 Tacos',
					'happy_hours': [
						{
							'id': 303,
							'weekday': Weekday.TUESDAY,
							'weekday_label': 'Tuesday',
							'start_time': '15:00',
							'end_time': '18:00',
							'all_day': False,
						}
					],
				},
			],
			'locations': [
				{
					'id': 505,
					'slug': '805-tacos-downtown-ventura',
					'name': '805 Tacos',
					'city': City.VENTURA,
					'city_label': 'Ventura',
					'venue_type': VenueType.RESTAURANT,
					'venue_type_label': 'Restaurant',
					'address_line_1': '123 Main St',
					'address_line_2': '',
					'neighborhood': '',
					'state': 'CA',
					'postal_code': '93001',
					'latitude': 34.2783,
					'longitude': -119.2931,
					'phone_number': '805-555-0111',
					'website_url': 'https://example.com/805-tacos',
					'image_urls': [],
					'operating_hours': [
						{
							'id': 404,
							'weekday': Weekday.MONDAY,
							'weekday_label': 'Monday',
							'open_time': '11:00',
							'close_time': '21:00',
						},
					],
					'is_active': True,
					'has_deals': True,
					'deal_count': 1,
					'operating_weekdays': [Weekday.MONDAY, Weekday.TUESDAY],
					'deal_weekdays': [Weekday.TUESDAY],
					'is_verified': True,
					'deals': [],
				},
			],
		}

	def test_health_endpoint(self):
		response = self.client.get(reverse('health-check'))

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.json()['status'], 'ok')

	def test_place_list_endpoint(self):
		with patch('places.views.get_source_place_payloads', return_value=[self.place_payload]):
			response = self.client.get(reverse('place-list'))

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.json()['count'], 1)
		self.assertEqual(response.json()['results'][0]['name'], '805 Tacos')
		self.assertEqual(response.json()['results'][0]['deal_weekdays'], [Weekday.TUESDAY])
		self.assertTrue(response.json()['results'][0]['is_verified'])

	def test_place_list_endpoint_passes_has_deals_filter(self):
		with patch('places.views.get_source_place_payloads', return_value=[self.place_payload]) as mock_get_source_place_payloads:
			response = self.client.get(reverse('place-list'), {'has_deals': 'true'})

		self.assertEqual(response.status_code, 200)
		mock_get_source_place_payloads.assert_called_once_with(city=None, venue_type=None, has_deals=True, resolve_missing_coordinates=True)

	def test_place_list_endpoint_allows_large_page_size(self):
		payloads = [
			{
				**self.place_payload,
				'id': index,
				'name': f'Place {index}',
				'slug': f'place-{index}',
			}
			for index in range(1, 121)
		]

		with patch('places.views.get_source_place_payloads', return_value=payloads):
			response = self.client.get(reverse('place-list'), {'page_size': '500'})

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.json()['count'], 120)
		self.assertEqual(len(response.json()['results']), 120)
		self.assertIsNone(response.json()['next'])

	def test_place_discovery_status_endpoint(self):
		records = [
			ImportedPlace(
				name='Curated Spot',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='1 Main St',
				source_name='business_websites',
			),
			ImportedPlace(
				name='Deal Spot',
				city=City.OXNARD,
				venue_type=VenueType.RESTAURANT,
				address_line_1='2 Main St',
				website_url='https://example.com/deal-spot',
				source_name='here_places',
				deals=[ImportedDeal(title='Happy Hour', deal_type=DealType.HAPPY_HOUR)],
			),
			ImportedPlace(
				name='No Deal Spot',
				city=City.CAMARILLO,
				venue_type=VenueType.CAFE,
				address_line_1='3 Main St',
				website_url='https://example.com/no-deal-spot',
				source_name='here_places',
			),
		]

		with patch('places.views.load_source_records', return_value=records):
			response = self.client.get(reverse('place-discovery-status'), {'limit': '5'})

		self.assertEqual(response.status_code, 200)
		payload = response.json()
		self.assertEqual(payload['total_records'], 3)
		self.assertEqual(payload['curated_records'], 1)
		self.assertEqual(payload['discovery_records'], 2)
		self.assertEqual(payload['discovery_with_deals'], 1)
		self.assertEqual(payload['discovery_without_deals'], 1)
		self.assertEqual(payload['sample_discovery_with_deals'][0]['name'], 'Deal Spot')
		self.assertEqual(payload['sample_discovery_without_deals'][0]['name'], 'No Deal Spot')

	def test_place_detail_includes_deals(self):
		with patch('places.views.get_source_place_payload', return_value=self.place_payload):
			response = self.client.get(reverse('place-detail', kwargs={'slug': self.place_payload['slug']}))

		self.assertEqual(response.status_code, 200)
		self.assertEqual(len(response.json()['deals']), 1)

	def test_place_detail_accepts_location_slug(self):
		location_slug = self.place_payload['locations'][0]['slug']
		with patch('places.views.get_source_place_payload', return_value=self.place_payload) as mock_get_source_place_payload:
			response = self.client.get(reverse('place-detail', kwargs={'slug': location_slug}))

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.json()['slug'], self.place_payload['slug'])
		mock_get_source_place_payload.assert_called_once_with(location_slug)

	def test_deal_list_endpoint(self):
		with patch('places.views.get_source_deal_payloads', return_value=self.place_payload['deals']):
			response = self.client.get(reverse('deal-list'))

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.json()['count'], 1)
		self.assertEqual(response.json()['results'][0]['title'], 'Taco Tuesday')


class HomeFeedApiTests(APITestCase):
	def setUp(self):
		self.user = User.objects.create_user(username='feed-owner', email='feed@example.com', password='secret12345')
		self.snapshot = ListingSnapshot.objects.create(
			name='805 Tacos',
			listing_slug='805-tacos-ventura',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
		)
		self.claim = BusinessClaim.objects.create(
			listing_snapshot=self.snapshot,
			claimant=self.user,
			contact_name='Owner',
			status=BusinessClaim.Status.APPROVED,
			pathway=BusinessClaim.Pathway.CLAIMED,
		)
		self.membership = BusinessMembership.objects.create(user=self.user, claim=self.claim, is_active=True)
		self.posts = [
			BusinessPost.objects.create(
				membership=self.membership,
				listing_snapshot=self.snapshot,
				content_type=content_type,
				status=BusinessPost.Status.PUBLISHED,
				title=title,
				summary=f'{title} summary',
				published_at=timezone.now() - timedelta(hours=index),
			)
			for index, (content_type, title) in enumerate([
				(BusinessPost.ContentType.SPECIAL, 'Late Night Special'),
				(BusinessPost.ContentType.ANNOUNCEMENT, 'Kitchen Remodel Done'),
				(BusinessPost.ContentType.EVENT, 'Live Music Friday'),
				(BusinessPost.ContentType.BLOG, 'Chef Story'),
				(BusinessPost.ContentType.SPECIAL, 'Weekend Combo'),
			])
		]
		self.campaign = SponsoredCampaign.objects.create(
			membership=self.membership,
			post=self.posts[0],
			name='Weekly Spotlight',
			status=SponsoredCampaign.Status.ACTIVE,
			weekly_impression_quota=10,
			starts_at=timezone.now() - timedelta(days=1),
		)

	def test_home_feed_mixes_sponsored_posts(self):
		response = self.client.get(reverse('home-feed'), {'page_size': '6'})

		self.assertEqual(response.status_code, 200)
		payload = response.json()
		self.assertGreaterEqual(len(payload['results']), 5)
		self.assertTrue(any(item['item_type'] == 'sponsored' for item in payload['results']))
		self.assertEqual(payload['results'][0]['item_type'], BusinessPost.ContentType.SPECIAL)

	def test_home_feed_respects_weekly_campaign_quota(self):
		for index in range(10):
			FeedImpression.objects.create(
				post=self.posts[0],
				campaign=self.campaign,
				placement_type=FeedImpression.PlacementType.SPONSORED,
				feed_item_id=f'campaign-{self.campaign.pk}',
				position=index,
			)

		response = self.client.get(reverse('home-feed'), {'page_size': '6'})

		self.assertEqual(response.status_code, 200)
		self.assertFalse(any(item['item_type'] == 'sponsored' for item in response.json()['results']))

	def test_feed_impression_endpoint_records_served_campaign(self):
		response = self.client.post(reverse('feed-impressions'), {
			'feed_item_id': f'campaign-{self.campaign.pk}',
			'post': self.posts[0].pk,
			'campaign': self.campaign.pk,
			'placement_type': FeedImpression.PlacementType.SPONSORED,
			'page_number': 1,
			'position': 4,
		}, format='json')

		self.assertEqual(response.status_code, 201)
		self.campaign.refresh_from_db()
		self.assertIsNotNone(self.campaign.last_served_at)
		self.assertEqual(FeedImpression.objects.count(), 1)

	def test_feed_engagement_endpoint_records_click(self):
		impression = FeedImpression.objects.create(
			post=self.posts[0],
			campaign=self.campaign,
			placement_type=FeedImpression.PlacementType.SPONSORED,
			feed_item_id=f'campaign-{self.campaign.pk}',
		)

		response = self.client.post(reverse('feed-engagements'), {
			'feed_item_id': f'campaign-{self.campaign.pk}',
			'post': self.posts[0].pk,
			'campaign': self.campaign.pk,
			'impression': impression.pk,
			'event_type': FeedEngagement.EventType.CLICK,
			'destination_url': 'https://example.com/late-night-special',
			'page_number': 1,
			'position': 4,
		}, format='json')

		self.assertEqual(response.status_code, 201)
		self.assertEqual(FeedEngagement.objects.count(), 1)
		self.assertEqual(FeedEngagement.objects.first().event_type, FeedEngagement.EventType.CLICK)


class SeedPhase2CommandTests(APITestCase):
	def test_seed_command_previews_source_data_without_writing_catalog_rows(self):
		output = StringIO()
		payload = [{
			'id': 1,
			'name': 'Source Place',
			'slug': 'source-place-ventura',
			'city': City.VENTURA,
			'city_label': 'Ventura',
			'venue_type': VenueType.RESTAURANT,
			'venue_type_label': 'Restaurant',
			'address_line_1': '123 Main St',
			'address_line_2': '',
			'neighborhood': '',
			'state': 'CA',
			'postal_code': '93001',
			'latitude': 34.2783,
			'longitude': -119.2931,
			'phone_number': '',
			'website_url': 'https://example.com/source-place',
			'is_active': True,
			'deals': [
				{
					'id': 2,
					'title': 'Live Deal',
					'description': 'Direct from website',
					'deal_type': DealType.HAPPY_HOUR,
					'deal_type_label': 'Happy Hour',
					'price_text': '$5',
					'terms': '',
					'is_active': True,
					'starts_on': None,
					'ends_on': None,
					'happy_hours': [{'id': 3, 'weekday': Weekday.MONDAY, 'weekday_label': 'Monday', 'start_time': '15:00', 'end_time': '18:00', 'all_day': False}],
				},
			],
		}]

		with patch('places.management.commands.seed_phase2.get_source_place_payloads', return_value=payload):
			call_command('seed_phase2', '--clear', stdout=output)

		self.assertEqual(ListingSnapshot.objects.count(), 0)
		self.assertIn('Fetched 1 places, 1 deals, and 1 happy hour windows from website sources.', output.getvalue())


class DemoHomeFeedCommandTests(TestCase):
	def test_seed_command_creates_demo_feed_dataset(self):
		output = StringIO()

		call_command('seed_demo_home_feed', stdout=output)

		expected_businesses = len(get_demo_home_feed_business_specs())
		self.assertEqual(ListingSnapshot.objects.filter(source_name=DEMO_HOME_FEED_SOURCE_NAME).count(), expected_businesses)
		self.assertEqual(BusinessClaim.objects.filter(listing_snapshot__source_name=DEMO_HOME_FEED_SOURCE_NAME).count(), expected_businesses)
		self.assertEqual(BusinessMembership.objects.filter(claim__listing_snapshot__source_name=DEMO_HOME_FEED_SOURCE_NAME).count(), expected_businesses)
		self.assertEqual(BusinessPost.objects.filter(listing_snapshot__source_name=DEMO_HOME_FEED_SOURCE_NAME).count(), 32)
		self.assertEqual(SponsoredCampaign.objects.filter(post__listing_snapshot__source_name=DEMO_HOME_FEED_SOURCE_NAME).count(), 11)
		self.assertIn('Seeded/updated 9 demo businesses, 32 posts, and 11 sponsored campaigns.', output.getvalue())

	def test_cleanup_command_removes_only_demo_feed_dataset(self):
		other_user = User.objects.create_user(username='real-owner', email='real@example.com', password='secret12345')
		other_snapshot = ListingSnapshot.objects.create(
			name='Real Business',
			listing_slug='real-business-ventura',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='1 Main St',
			source_name='manual_submission',
		)
		other_claim = BusinessClaim.objects.create(
			listing_snapshot=other_snapshot,
			claimant=other_user,
			contact_name='Owner',
			status=BusinessClaim.Status.APPROVED,
			pathway=BusinessClaim.Pathway.CLAIMED,
		)
		other_membership = BusinessMembership.objects.create(user=other_user, claim=other_claim, is_active=True)
		other_post = BusinessPost.objects.create(
			membership=other_membership,
			listing_snapshot=other_snapshot,
			content_type=BusinessPost.ContentType.SPECIAL,
			status=BusinessPost.Status.PUBLISHED,
			title='Real Special',
			slug='real-special',
		)
		SponsoredCampaign.objects.create(
			membership=other_membership,
			post=other_post,
			name='Real Boost',
			status=SponsoredCampaign.Status.ACTIVE,
			starts_at=timezone.now() - timedelta(days=1),
		)

		call_command('seed_demo_home_feed')
		output = StringIO()

		call_command('cleanup_demo_home_feed', stdout=output)

		self.assertEqual(ListingSnapshot.objects.filter(source_name=DEMO_HOME_FEED_SOURCE_NAME).count(), 0)
		self.assertEqual(BusinessClaim.objects.filter(listing_snapshot__source_name=DEMO_HOME_FEED_SOURCE_NAME).count(), 0)
		self.assertEqual(BusinessMembership.objects.filter(claim__listing_snapshot__source_name=DEMO_HOME_FEED_SOURCE_NAME).count(), 0)
		self.assertEqual(BusinessPost.objects.filter(listing_snapshot__source_name=DEMO_HOME_FEED_SOURCE_NAME).count(), 0)
		self.assertEqual(SponsoredCampaign.objects.filter(post__listing_snapshot__source_name=DEMO_HOME_FEED_SOURCE_NAME).count(), 0)
		self.assertTrue(ListingSnapshot.objects.filter(pk=other_snapshot.pk).exists())
		self.assertTrue(BusinessClaim.objects.filter(pk=other_claim.pk).exists())
		self.assertTrue(BusinessMembership.objects.filter(pk=other_membership.pk).exists())
		self.assertTrue(BusinessPost.objects.filter(pk=other_post.pk).exists())
		self.assertIn('Cleaned up 9 demo users, 9 demo businesses, 9 claims, 32 posts, and 11 sponsored campaigns.', output.getvalue())
class ImportSourceDataCommandTests(APITestCase):
	def test_import_command_fetches_source_records_without_writing_catalog_rows(self):
		output = StringIO()
		records = [
			ImportedPlace(
				name='Fetched Place',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='60 S California St',
				website_url='https://example.com/fetched-place',
				source_name='business_websites',
				source_url='https://example.com/fetched-place',
				deals=[
					ImportedDeal(
						title='Website Happy Hour',
						deal_type=DealType.HAPPY_HOUR,
						description='Fetched from live website HTML.',
						happy_hours=[
							ImportedHappyHour(weekday=Weekday.MONDAY, start_time='15:00', end_time='18:00'),
							ImportedHappyHour(weekday=Weekday.TUESDAY, start_time='15:00', end_time='18:00'),
						],
					),
				],
			),
		]

		class DummyImporter:
			def load_records(self_inner):
				return records

		with patch.dict('places.management.commands.import_source_data.IMPORTER_REGISTRY', {'business_websites': DummyImporter}, clear=False):
			call_command('import_source_data', '--source', 'business_websites', stdout=output)

		self.assertEqual(ListingSnapshot.objects.count(), 0)


class DiscoveryJsonStorageTests(TestCase):
	def test_json_importer_loads_stored_discovery_records(self):
		with TemporaryDirectory() as temp_dir:
			json_path = Path(temp_dir) / 'discovered_places.json'
			write_discovery_json_records([
				ImportedPlace(
					name='Stored Spot',
					city=City.VENTURA,
					venue_type=VenueType.RESTAURANT,
					address_line_1='123 Main St',
					website_url='https://example.com/stored-spot',
					source_name='here_places',
					external_id='here:stored-1',
					deals=[
						ImportedDeal(
							title='Happy Hour',
							deal_type=DealType.HAPPY_HOUR,
							happy_hours=[ImportedHappyHour(weekday=Weekday.MONDAY, start_time='15:00', end_time='18:00')],
						),
					],
				),
			], file_path=json_path)

			with self.settings(DISCOVERY_JSON_PATH=json_path):
				records = DiscoveryJsonPlacesImporter().load_records()

		self.assertEqual(len(records), 1)
		self.assertEqual(records[0].name, 'Stored Spot')
		self.assertEqual(len(records[0].deals), 1)
		self.assertEqual(len(records[0].deals[0].happy_hours), 1)

	def test_json_importer_bootstraps_runtime_discovery_file_from_seed(self):
		with TemporaryDirectory() as temp_dir:
			seed_path = Path(temp_dir) / 'seed-discovered-places.json'
			runtime_path = Path(temp_dir) / '.runtime' / 'discovered_places.json'
			write_discovery_json_records([
				ImportedPlace(
					name='Seeded Spot',
					city=City.VENTURA,
					venue_type=VenueType.RESTAURANT,
					address_line_1='123 Main St',
					website_url='https://example.com/seeded-spot',
					source_name='here_places',
					external_id='here:seeded-1',
				),
			], file_path=seed_path)

			with self.settings(
				DISCOVERY_JSON_PATH=runtime_path,
				DISCOVERY_JSON_SEED_PATH=seed_path,
				DISCOVERY_JSON_BOOTSTRAP_FROM_SEED=True,
			):
				records = DiscoveryJsonPlacesImporter().load_records()

			self.assertEqual(len(records), 1)
			self.assertEqual(records[0].external_id, 'here:seeded-1')
			self.assertTrue(runtime_path.exists())
			self.assertEqual(runtime_path.read_text(encoding='utf-8'), seed_path.read_text(encoding='utf-8'))

	def test_refresh_discovery_json_command_writes_enriched_here_records(self):
		with TemporaryDirectory() as temp_dir:
			json_path = Path(temp_dir) / 'discovered_places.json'
			output = StringIO()
			discovery_record = ImportedPlace(
				name='Discovery Spot',
				city=City.CAMARILLO,
				venue_type=VenueType.CAFE,
				address_line_1='2 Main St',
				website_url='https://example.com/discovery-spot',
				source_name='here_places',
				external_id='here:3',
			)
			class DummyDiscoveryImporter:
				def load_records(self_inner):
					return [discovery_record]
			enriched_record = ImportedPlace(
				name='Discovery Spot',
				city=City.CAMARILLO,
				venue_type=VenueType.CAFE,
				address_line_1='2 Main St',
				website_url='https://example.com/discovery-spot',
				source_name='here_places',
				external_id='here:3',
				deals=[ImportedDeal(title='Website Happy Hour', deal_type=DealType.HAPPY_HOUR)],
			)

			with self.settings(DISCOVERY_JSON_PATH=json_path):
				with patch.dict('places.management.commands.refresh_discovery_json.IMPORTER_REGISTRY', {'here_places': DummyDiscoveryImporter}, clear=False), patch.object(BusinessWebsiteImporter, 'enrich_place_records', return_value=[enriched_record]):
					call_command('refresh_discovery_json', '--source', 'here_places', stdout=output)

			records = load_discovery_json_records(json_path)

		self.assertEqual(len(records), 1)
		self.assertEqual(records[0].external_id, 'here:3')
		self.assertEqual(len(records[0].deals), 1)
		self.assertEqual(records[0].deals[0].title, 'Website Happy Hour')
		self.assertIn('Wrote 1 discovery places', output.getvalue())
		self.assertIn('Enriching discovery results from business websites before writing.', output.getvalue())
		self.assertIn('Loaded 1 discovery candidates, and 1 businesses to store.', output.getvalue())

	def test_refresh_discovery_json_command_limits_results(self):
		with TemporaryDirectory() as temp_dir:
			json_path = Path(temp_dir) / 'discovered_places.json'
			output = StringIO()
			records = [
				ImportedPlace(
					name='Discovery Spot 1',
					city=City.CAMARILLO,
					venue_type=VenueType.CAFE,
					address_line_1='2 Main St',
					website_url='https://example.com/discovery-1',
					source_name='here_places',
					external_id='here:1',
				),
				ImportedPlace(
					name='Discovery Spot 2',
					city=City.VENTURA,
					venue_type=VenueType.RESTAURANT,
					address_line_1='3 Main St',
					website_url='https://example.com/discovery-2',
					source_name='here_places',
					external_id='here:2',
				),
			]

			class DummyDiscoveryImporter:
				def load_records(self_inner):
					return records

			with self.settings(DISCOVERY_JSON_PATH=json_path):
				with patch.dict('places.management.commands.refresh_discovery_json.IMPORTER_REGISTRY', {'here_places': DummyDiscoveryImporter}, clear=False):
					call_command('refresh_discovery_json', '--source', 'here_places', '--limit', '1', '--skip-enrichment', stdout=output)

			stored_records = load_discovery_json_records(json_path)

		self.assertEqual(len(stored_records), 1)
		self.assertEqual(stored_records[0].external_id, 'here:1')
		self.assertIn('Writing raw discovery results without website enrichment.', output.getvalue())

	def test_refresh_discovery_json_command_merges_into_existing_json_and_filters_city(self):
		with TemporaryDirectory() as temp_dir:
			json_path = Path(temp_dir) / 'discovered_places.json'
			write_discovery_json_records([
				ImportedPlace(
					name='Existing Ventura Spot',
					city=City.VENTURA,
					venue_type=VenueType.RESTAURANT,
					address_line_1='1 Main St',
					source_name='here_places',
					external_id='here:existing',
				),
			], file_path=json_path)
			output = StringIO()
			records = [
				ImportedPlace(
					name='New Ventura Spot',
					city=City.VENTURA,
					venue_type=VenueType.CAFE,
					address_line_1='2 Main St',
					source_name='here_places',
					external_id='here:new-ventura',
				),
				ImportedPlace(
					name='Oxnard Spot',
					city=City.OXNARD,
					venue_type=VenueType.BAR,
					address_line_1='3 Main St',
					source_name='here_places',
					external_id='here:oxnard',
				),
			]

			class DummyDiscoveryImporter:
				def load_records(self_inner):
					return records

			with self.settings(DISCOVERY_JSON_PATH=json_path):
				with patch.dict('places.management.commands.refresh_discovery_json.IMPORTER_REGISTRY', {'here_places': DummyDiscoveryImporter}, clear=False), patch.object(BusinessWebsiteImporter, 'enrich_place_records', side_effect=lambda place_records: list(place_records)):
					call_command('refresh_discovery_json', '--source', 'here_places', '--city', 'ventura', stdout=output)

			stored_records = load_discovery_json_records(json_path)

		self.assertEqual(len(stored_records), 2)
		self.assertEqual({record.external_id for record in stored_records}, {'here:existing', 'here:new-ventura'})

	def test_curated_json_importer_keeps_curated_and_discovery_records(self):
		website_record = ImportedPlace(
			name='Lure Fish House',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='60 S California St',
			source_name='business_websites',
			external_id='curated:1',
		)
		discovery_record = ImportedPlace(
			name='Lure Fish House',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='60 S California St',
			source_name='here_places',
			external_id='here:1',
		)

		class DummyWebsiteImporter:
			def load_records(self_inner):
				return [website_record]

		class DummyDiscoveryImporter:
			def load_records(self_inner):
				return [discovery_record]

		records = CuratedJsonPlacesImporter(
			website_importer=DummyWebsiteImporter(),
			discovery_importer=DummyDiscoveryImporter(),
		).load_records()

		self.assertEqual(len(records), 2)
		self.assertEqual({record.source_name for record in records}, {'business_websites', 'here_places'})

	def test_refresh_discovery_json_command_skips_deleted_businesses(self):
		with TemporaryDirectory() as temp_dir:
			json_path = Path(temp_dir) / 'discovered_places.json'
			output = StringIO()
			DeletedBusiness.objects.create(
				name='Discovery Spot',
				city=City.CAMARILLO,
				venue_type=VenueType.CAFE,
				address_line_1='2 Main St',
				source_name='here_places',
				external_id='here:3',
			)
			discovery_record = ImportedPlace(
				name='Discovery Spot',
				city=City.CAMARILLO,
				venue_type=VenueType.CAFE,
				address_line_1='2 Main St',
				website_url='https://example.com/discovery-spot',
				source_name='here_places',
				external_id='here:3',
			)

			class DummyDiscoveryImporter:
				def load_records(self_inner):
					return [discovery_record]

			with self.settings(DISCOVERY_JSON_PATH=json_path):
				with patch.dict('places.management.commands.refresh_discovery_json.IMPORTER_REGISTRY', {'here_places': DummyDiscoveryImporter}, clear=False), patch.object(BusinessWebsiteImporter, 'enrich_place_records', side_effect=lambda place_records: list(place_records)):
					call_command('refresh_discovery_json', '--source', 'here_places', stdout=output)

			records = load_discovery_json_records(json_path)

		self.assertEqual(records, [])
		self.assertIn('Loaded 1 discovery candidates, and 0 businesses to store.', output.getvalue())

	def test_json_importer_skips_records_excluded_by_discovery_exclusions_file(self):
		with TemporaryDirectory() as temp_dir:
			json_path = Path(temp_dir) / 'discovered_places.json'
			exclusions_path = Path(temp_dir) / 'discovery_exclusions.json'
			exclusions_path.write_text(
				'{"here_places": {"excluded_businesses": [], "excluded_external_ids": ["here:stored-1"]}}',
				encoding='utf-8',
			)
			write_discovery_json_records([
				ImportedPlace(
					name='Stored Spot',
					city=City.VENTURA,
					venue_type=VenueType.RESTAURANT,
					address_line_1='123 Main St',
					source_name='here_places',
					external_id='here:stored-1',
				),
				ImportedPlace(
					name='Keep Spot',
					city=City.VENTURA,
					venue_type=VenueType.RESTAURANT,
					address_line_1='124 Main St',
					source_name='here_places',
					external_id='here:stored-2',
				),
			], file_path=json_path)

			with self.settings(DISCOVERY_JSON_PATH=json_path, DISCOVERY_EXCLUSIONS_PATH=exclusions_path):
				records = load_discovery_json_records(json_path)

		self.assertEqual(len(records), 1)
		self.assertEqual(records[0].external_id, 'here:stored-2')

	def test_refresh_discovery_json_command_skips_discovery_file_exclusions(self):
		with TemporaryDirectory() as temp_dir:
			json_path = Path(temp_dir) / 'discovered_places.json'
			exclusions_path = Path(temp_dir) / 'discovery_exclusions.json'
			exclusions_path.write_text(
				'{"here_places": {"excluded_businesses": [], "excluded_external_ids": ["here:3"]}}',
				encoding='utf-8',
			)
			output = StringIO()
			discovery_record = ImportedPlace(
				name='Discovery Spot',
				city=City.CAMARILLO,
				venue_type=VenueType.CAFE,
				address_line_1='2 Main St',
				website_url='https://example.com/discovery-spot',
				source_name='here_places',
				external_id='here:3',
			)

			class DummyDiscoveryImporter:
				def load_records(self_inner):
					return [discovery_record]

			with self.settings(DISCOVERY_JSON_PATH=json_path, DISCOVERY_EXCLUSIONS_PATH=exclusions_path):
				with patch.dict('places.management.commands.refresh_discovery_json.IMPORTER_REGISTRY', {'here_places': DummyDiscoveryImporter}, clear=False), patch.object(BusinessWebsiteImporter, 'enrich_place_records', side_effect=lambda place_records: list(place_records)):
					call_command('refresh_discovery_json', '--source', 'here_places', stdout=output)

			records = load_discovery_json_records(json_path)

		self.assertEqual(records, [])
		self.assertIn('Loaded 1 discovery candidates, and 0 businesses to store.', output.getvalue())

	def test_refresh_discovery_json_command_keeps_businesses_when_deleted_flag_is_cleared(self):
		with TemporaryDirectory() as temp_dir:
			json_path = Path(temp_dir) / 'discovered_places.json'
			output = StringIO()
			DeletedBusiness.objects.create(
				name='Discovery Spot',
				city=City.CAMARILLO,
				venue_type=VenueType.CAFE,
				address_line_1='2 Main St',
				source_name='here_places',
				external_id='here:3',
				deleted_from_business_database=False,
			)
			discovery_record = ImportedPlace(
				name='Discovery Spot',
				city=City.CAMARILLO,
				venue_type=VenueType.CAFE,
				address_line_1='2 Main St',
				website_url='https://example.com/discovery-spot',
				source_name='here_places',
				external_id='here:3',
			)

			class DummyDiscoveryImporter:
				def load_records(self_inner):
					return [discovery_record]

			with self.settings(DISCOVERY_JSON_PATH=json_path):
				with patch.dict('places.management.commands.refresh_discovery_json.IMPORTER_REGISTRY', {'here_places': DummyDiscoveryImporter}, clear=False), patch.object(BusinessWebsiteImporter, 'enrich_place_records', side_effect=lambda place_records: list(place_records)):
					call_command('refresh_discovery_json', '--source', 'here_places', stdout=output)

			records = load_discovery_json_records(json_path)

		self.assertEqual(len(records), 1)
		self.assertEqual(records[0].external_id, 'here:3')

	def test_backup_admin_data_command_creates_backup_bundle_with_snapshot_export(self):
		with TemporaryDirectory() as temp_dir:
			output_dir = Path(temp_dir) / 'backups'
			discovery_json_path = Path(temp_dir) / 'discovered_places.json'
			exclusions_path = Path(temp_dir) / 'discovery_exclusions.json'
			stdout = StringIO()

			def fake_sqlite_backup(_command, backup_dir):
				backup_path = backup_dir / 'db.sqlite3'
				backup_path.write_bytes(b'SQLite format 3\x00test-backup')
				return backup_path.name

			snapshot = ListingSnapshot.objects.create(
				name='Backup Bistro',
				listing_slug='backup-bistro',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='123 Main St',
				website_url='https://example.com/backup-bistro',
				source_name='here_places',
				external_id='here:backup-1',
				deal_overrides=[{
					'title': 'Admin Deal',
					'description': 'Saved by admin',
					'deal_type': DealType.HAPPY_HOUR,
					'price_text': '$5',
					'terms': '',
					'happy_hours': [],
				}],
			)
			write_discovery_json_records([
				ImportedPlace(
					name='Discovery Backup Spot',
					city=City.VENTURA,
					venue_type=VenueType.RESTAURANT,
					address_line_1='123 Main St',
					source_name='here_places',
					external_id='here:backup-1',
				),
			], file_path=discovery_json_path)
			exclusions_path.write_text('{"here_places": {"excluded_businesses": [], "excluded_external_ids": []}}', encoding='utf-8')

			with self.settings(DISCOVERY_JSON_PATH=discovery_json_path, DISCOVERY_EXCLUSIONS_PATH=exclusions_path):
				with patch('places.management.commands.backup_admin_data.Command._backup_sqlite_database', autospec=True, side_effect=fake_sqlite_backup):
					call_command('backup_admin_data', '--output-dir', str(output_dir), '--label', 'manual-admin', stdout=stdout)

			backup_dirs = list(output_dir.iterdir())

			self.assertEqual(len(backup_dirs), 1)
			backup_dir = backup_dirs[0]
			self.assertTrue((backup_dir / 'db.sqlite3').exists())
			self.assertTrue((backup_dir / 'database-fixture.json').exists())
			self.assertTrue((backup_dir / 'listing-snapshots.json').exists())
			self.assertTrue((backup_dir / 'manifest.json').exists())
			self.assertTrue((backup_dir / 'discovered_places.json').exists())
			self.assertTrue((backup_dir / 'discovery_exclusions.json').exists())

			manifest = json.loads((backup_dir / 'manifest.json').read_text(encoding='utf-8'))
			self.assertEqual(manifest['database_vendor'], 'sqlite')
			self.assertEqual(manifest['listing_snapshot_count'], 1)
			self.assertEqual(manifest['sqlite_database_backup'], 'db.sqlite3')

			snapshot_export = json.loads((backup_dir / 'listing-snapshots.json').read_text(encoding='utf-8'))
			self.assertEqual(snapshot_export['snapshot_count'], 1)
			self.assertEqual(snapshot_export['snapshots'][0]['fields']['name'], 'Backup Bistro')
			self.assertEqual(snapshot_export['snapshots'][0]['display_data']['stored_discovery_record']['external_id'], 'here:backup-1')
			self.assertEqual(snapshot_export['snapshots'][0]['display_data']['manual_deal_overrides'][0]['title'], 'Admin Deal')
			self.assertIn('Created backup bundle at', stdout.getvalue())


class BusinessWebsiteImporterTests(TestCase):
	def setUp(self):
		caches[getattr(settings, 'SOURCE_FETCH_CACHE_ALIAS', 'default')].clear()

	def tearDown(self):
		caches[getattr(settings, 'SOURCE_FETCH_CACHE_ALIAS', 'default')].clear()

	def test_importer_extracts_identity_and_promotions_from_business_pages(self):
		home_html = """
		<html>
			<head>
				<title>Test Bistro | Ventura</title>
				<script type="application/ld+json">
				{
					"@context": "https://schema.org",
					"@type": "Restaurant",
					"name": "Test Bistro",
					"url": "https://example.com/test-bistro",
					"telephone": "805-555-0100",
					"address": {
						"streetAddress": "123 Main St",
						"addressLocality": "Ventura",
						"addressRegion": "CA",
						"postalCode": "93001"
					}
				}
				</script>
			</head>
			<body>
				<section class="promo">Happy Hour Monday-Friday 3pm to 6pm. $5 margaritas and $2 off tacos.</section>
			</body>
		</html>
		"""
		deal_html = """
		<html>
			<body>
				<h1>Late Night Happy Hour</h1>
				<p>Late Night Happy Hour starts at 8pm to 10pm with $1.50 off pints.</p>
			</body>
		</html>
		"""

		session = CountingSession(home_html)

		def session_get(url, headers=None, timeout=None):
			session.calls.append({'url': url, 'headers': headers, 'timeout': timeout})
			if url.endswith('/happy-hour'):
				return StubResponse(deal_html)
			return StubResponse(home_html)

		session.get = session_get
		importer = BusinessWebsiteImporter(
			session=session,
			business_sources=[
				{
					'city': City.VENTURA,
					'venue_type': VenueType.RESTAURANT,
					'source_url': 'https://example.com/test-bistro',
					'deal_urls': ['https://example.com/test-bistro/happy-hour'],
				}
			],
		)

		records = importer.load_records()

		self.assertEqual(len(records), 1)
		self.assertEqual(records[0].name, 'Test Bistro')
		self.assertEqual(records[0].phone_number, '805-555-0100')
		self.assertGreaterEqual(len(records[0].deals), 2)
		self.assertIn('Happy Hour', records[0].deals[0].title)

	def test_importer_preserves_configured_coordinates(self):
		html = """
		<html>
			<head>
				<script type="application/ld+json">
				{
					"@context": "https://schema.org",
					"@type": "Restaurant",
					"name": "Cronies Sports Grill",
					"telephone": "805-555-0100",
					"address": {
						"streetAddress": "2855 Johnson Dr",
						"addressLocality": "Ventura",
						"addressRegion": "CA",
						"postalCode": "93003"
					}
				}
				</script>
			</head>
			<body></body>
		</html>
		"""

		importer = BusinessWebsiteImporter(
			session=CountingSession(html),
			business_sources=[
				{
					'city': City.VENTURA,
					'venue_type': VenueType.BAR,
					'source_url': 'https://example.com/cronies',
					'latitude': 34.2477,
					'longitude': -119.19652,
				}
			],
		)

		records = importer.load_records()

		self.assertEqual(records[0].latitude, 34.2477)
		self.assertEqual(records[0].longitude, -119.19652)

	def test_importer_skips_broken_source_when_not_strict(self):
		class BrokenSession:
			def get(self, url, headers=None, timeout=None):
				raise RuntimeError('source fetch failed')

		importer = BusinessWebsiteImporter(
			session=BrokenSession(),
			business_sources=[
				{
					'name': 'Broken Source',
					'city': City.VENTURA,
					'venue_type': VenueType.RESTAURANT,
					'source_url': 'https://example.com/broken-source',
				}
			],
		)

		records = importer.load_records()

		self.assertEqual(records, [])
		self.assertEqual(len(importer.load_errors), 1)
		self.assertEqual(importer.load_errors[0]['name'], 'Broken Source')

	def test_default_external_id_stays_unique_for_long_same_prefix_values(self):
		importer = BusinessWebsiteImporter(business_sources=[])

		first_id = importer._default_external_id(
			'https://www.institutionales.com/happy-hour#Happy Hour CAMARILLO LOCATION NEW'
		)
		second_id = importer._default_external_id(
			'https://www.institutionales.com/happy-hour#Happy Hour - Institution Ale Co.'
		)

		self.assertNotEqual(first_id, second_id)

	def test_importer_merges_overlapping_duplicate_deals(self):
		importer = BusinessWebsiteImporter(business_sources=[])
		soup = BeautifulSoup(
			"""
			<html>
				<body>
					<section>Happy Hour Specials 3:00PM - 5:00PM Monday - Friday Scroll to Finney Craft section Gift Cards Buy now</section>
					<section>Happy Hour Specials 3:00PM - 5:00PM Monday - Friday Scroll to Finney Craft section</section>
				</body>
			</html>
			""",
			'html.parser',
		)

		deals = importer._extract_deals({}, [soup], ['https://example.com/finneys'])

		self.assertEqual(len(deals), 1)
		self.assertEqual(deals[0].title, 'Happy Hour')

	def test_importer_prefers_explicit_deal_selectors_over_full_page_fallback(self):
		html = """
		<html>
			<body>
				<section id="happy-hour">Happy Hour Monday-Friday 3pm to 6pm. $5 margaritas.</section>
				<section>Lunch special served all day.</section>
			</body>
		</html>
		"""
		importer = BusinessWebsiteImporter(session=CountingSession(html), business_sources=[])
		soup = BeautifulSoup(html, 'html.parser')

		deals = importer._extract_deals({'deal_selectors': ['#happy-hour']}, [soup], ['https://example.com/location'])

		self.assertEqual(len(deals), 1)
		self.assertEqual(deals[0].deal_type, DealType.HAPPY_HOUR)
		self.assertEqual(
			[(window.weekday, window.start_time, window.end_time) for window in deals[0].happy_hours],
			[
				(Weekday.MONDAY, '15:00', '18:00'),
				(Weekday.TUESDAY, '15:00', '18:00'),
				(Weekday.WEDNESDAY, '15:00', '18:00'),
				(Weekday.THURSDAY, '15:00', '18:00'),
				(Weekday.FRIDAY, '15:00', '18:00'),
			],
		)

	def test_importer_scopes_shared_happy_hour_page_to_configured_city(self):
		home_html = """
		<html>
			<body>
				<h1>Institution Ale Co.</h1>
				<p>Fresh beer and food in Camarillo.</p>
			</body>
		</html>
		"""
		deal_html = """
		<html>
			<body>
				<section>
					<h1>HAPPY HOUR</h1>
					<p>CAMARILLO LOCATION</p>
					<p>MONDAY - THURSDAY 9:00PM - CLOSE</p>
					<p>WEDNESDAYS 4:00PM - CLOSE</p>
					<p>SUNDAYS 8:00PM - CLOSE</p>
					<p>SANTA BARBARA LOCATION</p>
					<p>MONDAY - THURSDAY 3:00PM - 6:00PM</p>
				</section>
			</body>
		</html>
		"""
		hours_html = """
		<html>
			<body>
				<section>
					<h1>TASTING ROOM HOURS</h1>
					<p>Camarillo Hours</p>
					<p>Monday - Saturday: 11am - 11pm (kitchen closes at 9:30pm)</p>
					<p>Sunday: 11am - 10pm (kitchen closes at 8:30pm)</p>
					<p>Santa Barbara Hours</p>
					<p>Monday - Saturday: 11am - 11pm (kitchen closes at 9pm)</p>
					<p>Sunday: 11am - 10pm (kitchen closes at 8pm)</p>
				</section>
			</body>
		</html>
		"""
		session = CountingSession(home_html)

		def session_get(url, headers=None, timeout=None):
			session.calls.append({'url': url, 'headers': headers, 'timeout': timeout})
			if url.endswith('/happy-hour'):
				return StubResponse(deal_html)
			if url.endswith('/hours'):
				return StubResponse(hours_html)
			return StubResponse(home_html)

		session.get = session_get
		importer = BusinessWebsiteImporter(
			session=session,
			business_sources=[
				{
					'name': 'Institution Ale Co.',
					'city': City.CAMARILLO,
					'venue_type': VenueType.BAR,
					'source_url': 'https://example.com/institution',
					'deal_urls': ['https://example.com/institution/happy-hour'],
					'hours_url': 'https://example.com/institution/hours',
				}
			],
		)

		records = importer.load_records()
		expected_windows = [
			(Weekday.MONDAY, '21:00', '23:00'),
			(Weekday.TUESDAY, '21:00', '23:00'),
			(Weekday.WEDNESDAY, '21:00', '23:00'),
			(Weekday.THURSDAY, '21:00', '23:00'),
			(Weekday.WEDNESDAY, '16:00', '23:00'),
			(Weekday.SUNDAY, '20:00', '22:00'),
		]

		actual_windows = [
			(window.weekday, window.start_time, window.end_time)
			for deal in records[0].deals
			for window in deal.happy_hours
		]

		for expected_window in expected_windows:
			self.assertIn(expected_window, actual_windows)

	def test_importer_supports_configured_deal_texts(self):
		importer = BusinessWebsiteImporter(
			session=CountingSession('<html><body>Generic page</body></html>'),
			business_sources=[
				{
					'name': 'Lazy Dog Restaurant & Bar',
					'city': City.OXNARD,
					'venue_type': VenueType.BAR,
					'source_url': 'https://example.com/lazy-dog',
					'deal_texts': ['Happy Hour Mon-Fri: 3pm-6pm. Late Night Sun-Thu: 9pm-11pm.'],
				}
			],
		)

		records = importer.load_records()

		self.assertEqual(len(records[0].deals), 1)
		self.assertEqual(records[0].deals[0].title, 'Happy Hour')
		self.assertEqual(
			[(window.weekday, window.start_time, window.end_time) for window in records[0].deals[0].happy_hours],
			[
				(Weekday.MONDAY, '15:00', '18:00'),
				(Weekday.TUESDAY, '15:00', '18:00'),
				(Weekday.WEDNESDAY, '15:00', '18:00'),
				(Weekday.THURSDAY, '15:00', '18:00'),
				(Weekday.FRIDAY, '15:00', '18:00'),
				(Weekday.SUNDAY, '21:00', '23:00'),
				(Weekday.MONDAY, '21:00', '23:00'),
				(Weekday.TUESDAY, '21:00', '23:00'),
				(Weekday.WEDNESDAY, '21:00', '23:00'),
				(Weekday.THURSDAY, '21:00', '23:00'),
			],
		)

	def test_importer_supports_prioritized_source_documents(self):
		identity_html = """
		<html>
			<head>
				<script type="application/ld+json">
				{
					"@context": "https://schema.org",
					"@type": "Restaurant",
					"name": "Priority Bistro",
					"url": "https://example.com/priority-bistro",
					"telephone": "805-555-0199",
					"address": {
						"streetAddress": "999 Main St",
						"addressLocality": "Ventura",
						"addressRegion": "CA",
						"postalCode": "93001"
					}
				}
				</script>
			</head>
			<body></body>
		</html>
		"""
		deals_html = """
		<html>
			<body>
				<section>Happy Hour Monday - Friday 3pm - close. $6 cocktails.</section>
			</body>
		</html>
		"""
		hours_html = """
		<html>
			<body>
				<section>Monday - Friday: 11am - 10pm</section>
			</body>
		</html>
		"""

		session = CountingSession(identity_html)

		def session_get(url, headers=None, timeout=None):
			session.calls.append({'url': url, 'headers': headers, 'timeout': timeout})
			if url.endswith('/deals'):
				return StubResponse(deals_html)
			if url.endswith('/hours'):
				return StubResponse(hours_html)
			return StubResponse(identity_html)

		session.get = session_get
		importer = BusinessWebsiteImporter(
			session=session,
			business_sources=[
				{
					'city': City.VENTURA,
					'venue_type': VenueType.RESTAURANT,
					'source_url': 'https://example.com/priority-bistro',
					'source_documents': [
						{'url': 'https://example.com/priority-bistro', 'roles': ['identity']},
						{'url': 'https://example.com/priority-bistro/deals', 'roles': ['deals']},
						{'url': 'https://example.com/priority-bistro/hours', 'roles': ['hours']},
					],
				}
			],
		)

		records = importer.load_records()

		self.assertEqual(records[0].name, 'Priority Bistro')
		self.assertEqual(records[0].address_line_1, '999 Main St')
		self.assertEqual(records[0].deals[0].source_url, 'https://example.com/priority-bistro/deals')
		self.assertEqual(
			[(window.weekday, window.open_time, window.close_time) for window in records[0].operating_hours],
			[
				(Weekday.MONDAY, '11:00', '22:00'),
				(Weekday.TUESDAY, '11:00', '22:00'),
				(Weekday.WEDNESDAY, '11:00', '22:00'),
				(Weekday.THURSDAY, '11:00', '22:00'),
				(Weekday.FRIDAY, '11:00', '22:00'),
			],
		)
		self.assertEqual(
			[(window.weekday, window.start_time, window.end_time) for window in records[0].deals[0].happy_hours],
			[
				(Weekday.MONDAY, '15:00', '22:00'),
				(Weekday.TUESDAY, '15:00', '22:00'),
				(Weekday.WEDNESDAY, '15:00', '22:00'),
				(Weekday.THURSDAY, '15:00', '22:00'),
				(Weekday.FRIDAY, '15:00', '22:00'),
			],
		)

	def test_importer_supports_inline_deal_source_documents(self):
		importer = BusinessWebsiteImporter(
			session=CountingSession('<html><body>Ignored primary page</body></html>'),
			business_sources=[
				{
					'name': 'Inline Deal Source',
					'city': City.OXNARD,
					'venue_type': VenueType.BAR,
					'source_url': 'https://example.com/inline-source',
					'source_documents': [
						{'url': 'https://example.com/inline-source', 'roles': ['identity']},
						{'text': 'Happy Hour Sun-Thu 9pm-11pm.', 'roles': ['deals']},
					],
				}
			],
		)

		records = importer.load_records()

		self.assertEqual(len(records[0].deals), 1)
		self.assertEqual(records[0].deals[0].source_url, 'https://example.com/inline-source')
		self.assertEqual(
			[(window.weekday, window.start_time, window.end_time) for window in records[0].deals[0].happy_hours],
			[
				(Weekday.SUNDAY, '21:00', '23:00'),
				(Weekday.MONDAY, '21:00', '23:00'),
				(Weekday.TUESDAY, '21:00', '23:00'),
				(Weekday.WEDNESDAY, '21:00', '23:00'),
				(Weekday.THURSDAY, '21:00', '23:00'),
			],
		)

	def test_importer_supports_inline_hours_source_documents(self):
		importer = BusinessWebsiteImporter(
			session=CountingSession('<html><body>Ignored primary page</body></html>'),
			business_sources=[
				{
					'name': 'Inline Hours Source',
					'city': City.OXNARD,
					'venue_type': VenueType.BAR,
					'source_url': 'https://example.com/inline-hours-source',
					'source_documents': [
						{'url': 'https://example.com/inline-hours-source', 'roles': ['identity']},
						{'text': 'Monday - Thursday: 11:00am - 11:00pm. Friday: 11:00am - 12:00am. Saturday: 10:00am - 12:00am. Sunday: 10:00am - 11:00pm.', 'roles': ['hours']},
					],
				}
			],
		)

		records = importer.load_records()

		self.assertEqual(
			[(window.weekday, window.open_time, window.close_time) for window in records[0].operating_hours],
			[
				(Weekday.MONDAY, '11:00', '23:00'),
				(Weekday.TUESDAY, '11:00', '23:00'),
				(Weekday.WEDNESDAY, '11:00', '23:00'),
				(Weekday.THURSDAY, '11:00', '23:00'),
				(Weekday.FRIDAY, '11:00', '00:00'),
				(Weekday.SATURDAY, '10:00', '00:00'),
				(Weekday.SUNDAY, '10:00', '23:00'),
			],
		)

	def test_importer_supports_pdf_deal_source_documents(self):
		html = """
		<html>
			<head>
				<script type="application/ld+json">
				{
					"@context": "https://schema.org",
					"@type": "BarOrPub",
					"name": "PDF Deal Source",
					"address": {
						"streetAddress": "42 Main Street",
						"addressLocality": "Ventura",
						"addressRegion": "CA",
						"postalCode": "93001"
					}
				}
				</script>
			</head>
			<body></body>
		</html>
		"""

		session = CountingSession(html)

		def session_get(url, headers=None, timeout=None):
			session.calls.append({'url': url, 'headers': headers, 'timeout': timeout})
			if url.endswith('.pdf'):
				return StubResponse('', content=b'%PDF-1.4 mock pdf bytes')
			return StubResponse(html)

		session.get = session_get
		importer = BusinessWebsiteImporter(
			session=session,
			business_sources=[
				{
					'city': City.VENTURA,
					'venue_type': VenueType.BAR,
					'source_url': 'https://example.com/pdf-deal-source',
					'source_documents': [
						{'url': 'https://example.com/pdf-deal-source', 'roles': ['identity']},
						{'url': 'https://example.com/menus/happy-hour.pdf', 'roles': ['deals'], 'format': 'pdf'},
					],
				}
			],
		)

		with patch.object(
			BusinessWebsiteImporter,
			'_extract_pdf_text',
			return_value='Happy Hour Monday-Friday 3:00 - 5:00. $7 cocktails.',
		):
			records = importer.load_records()

		self.assertEqual(records[0].name, 'PDF Deal Source')
		self.assertEqual(len(records[0].deals), 1)
		self.assertEqual(records[0].deals[0].source_url, 'https://example.com/menus/happy-hour.pdf')
		self.assertEqual(
			[(window.weekday, window.start_time, window.end_time) for window in records[0].deals[0].happy_hours],
			[
				(Weekday.MONDAY, '15:00', '17:00'),
				(Weekday.TUESDAY, '15:00', '17:00'),
				(Weekday.WEDNESDAY, '15:00', '17:00'),
				(Weekday.THURSDAY, '15:00', '17:00'),
				(Weekday.FRIDAY, '15:00', '17:00'),
			],
		)

	@override_settings(DISCOVERY_WEBSITE_FALLBACK_PATHS=('/menu.pdf',))
	def test_importer_skips_invalid_discovery_pdf_document_without_crashing(self):
		home_html = """
		<html>
			<body>
				<section>Welcome to Discovery Bistro.</section>
			</body>
		</html>
		"""

		class StubSession:
			def __init__(self):
				self.calls = []

			def get(self, url, headers=None, timeout=None):
				self.calls.append(url)
				if url.endswith('.pdf'):
					return StubResponse('', content=b'<!DOCTYPE html><html><body>not a pdf</body></html>')
				return StubResponse(home_html)

		session = StubSession()
		importer = BusinessWebsiteImporter(session=session, business_sources=[])
		place_record = ImportedPlace(
			name='Broken PDF Discovery Spot',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
			website_url='https://broken-pdf.example.com/home',
			source_name='here_places',
		)

		enriched_record = importer.enrich_place_record(place_record)

		self.assertEqual(len(enriched_record.deals), 0)
		self.assertEqual(getattr(enriched_record, 'discovery_enrichment_status', ''), 'auto_no_evidence')
		self.assertIn('https://broken-pdf.example.com/menu.pdf', session.calls)

	def test_importer_enriches_discovery_place_from_homepage_and_promo_links(self):
		home_html = """
		<html>
			<head>
				<script type="application/ld+json">
				{
					"@context": "https://schema.org",
					"@type": "Restaurant",
					"name": "Discovery Bistro",
					"url": "https://example.com/discovery-bistro",
					"telephone": "805-555-0111"
				}
				</script>
			</head>
			<body>
				<a href="/happy-hour">Happy Hour</a>
				<section>Join us for lunch specials every weekday.</section>
			</body>
		</html>
		"""
		deal_html = """
		<html>
			<body>
				<section>Happy Hour Monday-Friday 3pm to 6pm. $6 cocktails and $2 off appetizers.</section>
			</body>
		</html>
		"""

		class StubSession:
			def __init__(self):
				self.calls = []

			def get(self, url, headers=None, timeout=None):
				self.calls.append(url)
				if url.endswith('/happy-hour'):
					return StubResponse(deal_html)
				return StubResponse(home_html)

		session = StubSession()
		importer = BusinessWebsiteImporter(session=session, business_sources=[])
		place_record = ImportedPlace(
			name='Discovery Bistro',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
			website_url='https://example.com/discovery-bistro',
			external_id='here:1',
			source_name='here_places',
			source_url='https://discover.search.hereapi.com/v1/discover',
		)

		enriched_record = importer.enrich_place_record(place_record)

		self.assertGreaterEqual(len(enriched_record.deals), 1)
		self.assertEqual(getattr(enriched_record, 'discovery_enrichment_status', ''), 'auto_confirmed')
		self.assertEqual(enriched_record.phone_number, '805-555-0111')
		self.assertIn('https://example.com/discovery-bistro', session.calls)
		self.assertIn('https://example.com/happy-hour', session.calls)

	@override_settings(DISCOVERY_WEBSITE_FALLBACK_PATHS=('/happy-hour',))
	def test_importer_probes_fallback_promotion_paths_when_homepage_has_no_link(self):
		home_html = """
		<html>
			<body>
				<section>Welcome to Discovery Bistro.</section>
			</body>
		</html>
		"""
		deal_html = """
		<html>
			<body>
				<section>Happy Hour Monday-Friday 3pm to 6pm. $6 cocktails.</section>
			</body>
		</html>
		"""

		class StubSession:
			def __init__(self):
				self.calls = []

			def get(self, url, headers=None, timeout=None):
				self.calls.append(url)
				if url.endswith('/happy-hour'):
					return StubResponse(deal_html)
				return StubResponse(home_html)

		session = StubSession()
		importer = BusinessWebsiteImporter(session=session, business_sources=[])
		place_record = ImportedPlace(
			name='Fallback Bistro',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
			website_url='https://fallback-bistro.example.com/home',
			source_name='here_places',
		)

		enriched_record = importer.enrich_place_record(place_record)

		self.assertGreaterEqual(len(enriched_record.deals), 1)
		self.assertIn('https://fallback-bistro.example.com/happy-hour', session.calls)

	def test_importer_uses_source_url_as_discovery_scrape_source_when_supported(self):
		home_html = """
		<html>
			<body>
				<a href="happy-hour">Happy Hour</a>
			</body>
		</html>
		"""
		deal_html = """
		<html>
			<body>
				<section>Happy Hour Monday-Friday 3pm to 6pm. $6 cocktails.</section>
			</body>
		</html>
		"""

		class StubSession:
			def __init__(self):
				self.calls = []

			def get(self, url, headers=None, timeout=None):
				self.calls.append(url)
				if url.endswith('/specials/happy-hour'):
					return StubResponse(deal_html)
				return StubResponse(home_html)

		session = StubSession()
		importer = BusinessWebsiteImporter(session=session, business_sources=[])
		place_record = ImportedPlace(
			name='Split URL Bistro',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
			website_url='https://public.example.com/split-url-bistro',
			source_name='here_places',
			source_url='https://public.example.com/specials/',
		)

		enriched_record = importer.enrich_place_record(place_record)

		self.assertGreaterEqual(len(enriched_record.deals), 1)
		self.assertIn('https://public.example.com/specials/', session.calls)
		self.assertIn('https://public.example.com/specials/happy-hour', session.calls)
		self.assertNotIn('https://public.example.com/split-url-bistro', session.calls)
		self.assertEqual(enriched_record.website_url, 'https://public.example.com/split-url-bistro')

	def test_importer_skips_discovery_enrichment_without_http_website(self):
		importer = BusinessWebsiteImporter(business_sources=[])
		place_record = ImportedPlace(
			name='No Website Spot',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
			website_url='',
			source_name='here_places',
		)

		enriched_record = importer.enrich_place_record(place_record)

		self.assertEqual(getattr(enriched_record, 'discovery_enrichment_status', ''), 'blocked_url')
		self.assertEqual(enriched_record, place_record)

	def test_importer_skips_discovery_enrichment_for_blocked_host_urls(self):
		class StubSession:
			def get(self, url, headers=None, timeout=None):
				raise AssertionError('blocked discovery URLs should not be fetched')

		importer = BusinessWebsiteImporter(session=StubSession(), business_sources=[])
		place_record = ImportedPlace(
			name='Social Listing',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
			website_url='https://www.facebook.com/restaurant-page',
			source_name='here_places',
		)

		enriched_record = importer.enrich_place_record(place_record)

		self.assertEqual(getattr(enriched_record, 'discovery_enrichment_status', ''), 'blocked_url')
		self.assertEqual(enriched_record, place_record)

	def test_importer_allows_yelp_business_source_url_when_no_supported_website_exists(self):
		html = """
		<html>
			<body>
				<section class="promo">Happy Hour Monday-Friday 3pm to 6pm. $5 margaritas and $2 off tacos.</section>
			</body>
		</html>
		"""

		class StubSession:
			def __init__(self):
				self.calls = []

			def get(self, url, headers=None, timeout=None):
				self.calls.append(url)
				return StubResponse(html)

		session = StubSession()
		importer = BusinessWebsiteImporter(session=session, business_sources=[])
		place_record = ImportedPlace(
			name='Yelp Bistro',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
			website_url='',
			source_name='here_places',
			source_url='https://www.yelp.com/biz/yelp-bistro-ventura',
		)

		enriched_record = importer.enrich_place_record(place_record)

		self.assertGreaterEqual(len(enriched_record.deals), 1)
		self.assertEqual(getattr(enriched_record, 'discovery_enrichment_status', ''), 'auto_confirmed')
		self.assertEqual(session.calls, ['https://www.yelp.com/biz/yelp-bistro-ventura'])

	def test_importer_keeps_preferring_supported_first_party_website_over_yelp_source_url(self):
		class StubSession:
			def __init__(self):
				self.calls = []

			def get(self, url, headers=None, timeout=None):
				self.calls.append(url)
				return StubResponse('<html><body>Welcome.</body></html>')

		session = StubSession()
		importer = BusinessWebsiteImporter(session=session, business_sources=[])
		place_record = ImportedPlace(
			name='First Party Bistro',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
			website_url='https://firstparty.example.com/menu',
			source_name='here_places',
			source_url='https://www.yelp.com/biz/first-party-bistro-ventura',
		)

		importer.enrich_place_record(place_record)

		self.assertEqual(session.calls[0], 'https://firstparty.example.com/menu')

	@override_settings(DISCOVERY_WEBSITE_FALLBACK_PATHS=('/happy-hour',))
	def test_importer_marks_discovery_place_as_auto_no_evidence_when_no_deals_found(self):
		importer = BusinessWebsiteImporter(session=CountingSession('<html><body>Welcome.</body></html>'), business_sources=[])
		place_record = ImportedPlace(
			name='Plain Bistro',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
			website_url='https://plain-bistro.example.com/home',
			source_name='here_places',
		)

		enriched_record = importer.enrich_place_record(place_record)

		self.assertEqual(getattr(enriched_record, 'discovery_enrichment_status', ''), 'auto_no_evidence')

	def test_importer_prefers_discovery_city_over_out_of_area_structured_city(self):
		html = """
		<html>
			<head>
				<script type="application/ld+json">
				{
					"@context": "https://schema.org",
					"@type": "Restaurant",
					"name": "Chain Bistro",
					"telephone": "805-555-0199",
					"address": {
						"streetAddress": "999 Corporate Plaza",
						"addressLocality": "Encino",
						"addressRegion": "CA",
						"postalCode": "91436"
					}
				}
				</script>
			</head>
			<body>
				<section>Happy Hour Monday-Friday 3pm to 6pm. $6 cocktails.</section>
			</body>
		</html>
		"""

		importer = BusinessWebsiteImporter(session=CountingSession(html), business_sources=[])
		place_record = ImportedPlace(
			name='Chain Bistro Ventura',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
			website_url='https://example.com/chain-bistro',
			source_name='here_places',
		)

		enriched_record = importer.enrich_place_record(place_record)

		self.assertEqual(enriched_record.city, City.VENTURA)
		self.assertGreaterEqual(len(enriched_record.deals), 1)

	def test_importer_extracts_contact_details_from_map_links_when_schema_is_missing(self):
		html = """
		<html>
			<body>
				<a href="https://www.google.com/maps/dir//2751+Park+View+Court,+Oxnard,+CA+93036">2751 Park View Court, Oxnard, CA 93036</a>
				<a href="tel:(805)555-0101">(805) 555-0101</a>
			</body>
		</html>
		"""

		importer = BusinessWebsiteImporter(
			session=CountingSession(html),
			business_sources=[
				{
					'name': 'RiverPark Test',
					'city': City.OXNARD,
					'venue_type': VenueType.ATTRACTION,
					'source_url': 'https://example.com/riverpark',
				}
			],
		)

		records = importer.load_records()

		self.assertEqual(records[0].address_line_1, '2751 Park View Court')
		self.assertEqual(records[0].postal_code, '93036')
		self.assertEqual(records[0].phone_number, '(805)555-0101')

	def test_here_importer_combines_house_number_and_street_for_address_line_1(self):
		importer = HerePlacesImporter(session=MagicMock())
		item = {
			'id': 'test-place-1',
			'title': 'Test Bistro',
			'address': {
				'houseNumber': '123',
				'street': 'Main St',
				'postalCode': '93001',
				'stateCode': 'CA',
			},
			'position': {'lat': 34.28, 'lng': -119.29},
			'contacts': [{'phone': [{'value': '805-555-0101'}], 'www': [{'value': 'https://example.com'}]}],
			'href': 'https://discover.search.hereapi.com/v1/discover/test-place-1',
		}

		record = importer._build_place_record(City.VENTURA, VenueType.RESTAURANT, item)

		self.assertIsNotNone(record)
		self.assertEqual(record.address_line_1, '123 Main St')

	def test_here_importer_keeps_suite_number_in_address_line_1_when_label_includes_it(self):
		importer = HerePlacesImporter(session=MagicMock())
		item = {
			'id': 'test-place-suite-1',
			'title': 'Suite Test Bistro',
			'address': {
				'houseNumber': '501',
				'street': 'Collection Blvd',
				'label': '501 Collection Blvd Ste # 4130, Oxnard, CA 93036, United States',
				'postalCode': '93036',
				'stateCode': 'CA',
			},
			'position': {'lat': 34.22, 'lng': -119.18},
			'contacts': [{'phone': [{'value': '805-555-0101'}], 'www': [{'value': 'https://example.com'}]}],
			'href': 'https://discover.search.hereapi.com/v1/discover/test-place-suite-1',
		}

		record = importer._build_place_record(City.OXNARD, VenueType.RESTAURANT, item)

		self.assertIsNotNone(record)
		self.assertEqual(record.address_line_1, '501 Collection Blvd Ste # 4130')

	def test_importer_extracts_city_scoped_contact_details_from_embedded_location_payload(self):
		html = """
		<html>
			<body>
				<script>
				window.__LOCATIONS__ = [
					{"address_street_1":"123 Elsewhere Ave","city":"Orange","phone":"(714) 555-0101","post_code":"92867"},
					{"address_street_1":"598 Town Center Dr","city":"Oxnard","phone":"(805) 351-4888","post_code":"93036"}
				];
				</script>
			</body>
		</html>
		"""

		importer = BusinessWebsiteImporter(
			session=CountingSession(html),
			business_sources=[
				{
					'name': 'Lazy Dog Restaurant & Bar',
					'city': City.OXNARD,
					'venue_type': VenueType.BAR,
					'source_url': 'https://example.com/lazy-dog',
				}
			],
		)

		records = importer.load_records()

		self.assertEqual(records[0].address_line_1, '598 Town Center Dr')
		self.assertEqual(records[0].postal_code, '93036')
		self.assertEqual(records[0].phone_number, '(805) 351-4888')

	def test_importer_extracts_preview_image_urls(self):
		html = """
		<html>
			<head>
				<meta property="og:image" content="/images/interior-hero.jpg" />
			</head>
			<body>
				<img src="https://example.com/images/happy-hour-platter.jpg" alt="Happy hour platter" />
				<img src="https://example.com/images/cocktails.jpg" alt="Cocktails and drinks" />
				<img src="https://example.com/images/interior-shot.jpg" alt="Restaurant interior" />
				<img src="https://example.com/images/logo.png" alt="Logo" />
			</body>
		</html>
		"""

		importer = BusinessWebsiteImporter(
			session=CountingSession(html),
			business_sources=[
				{
					'name': 'Photo Test',
					'city': City.VENTURA,
					'venue_type': VenueType.RESTAURANT,
					'source_url': 'https://example.com/photo-test',
				}
			],
		)

		records = importer.load_records()

		self.assertEqual(
			records[0].image_urls,
			[
				'https://example.com/images/happy-hour-platter.jpg',
				'https://example.com/images/cocktails.jpg',
				'https://example.com/images/interior-hero.jpg',
				'https://example.com/images/interior-shot.jpg',
			],
		)

	def test_importer_deduplicates_same_photo_variants(self):
		html = """
		<html>
			<body>
				<img src="https://example.com/images/tacos-1200x900.jpg" alt="Taco platter" />
				<img src="https://example.com/images/tacos-600x450.jpg?fit=cover" alt="Taco platter closeup" />
				<img src="https://example.com/images/margarita.jpg?width=800" alt="Happy hour margarita" />
			</body>
		</html>
		"""

		importer = BusinessWebsiteImporter(
			session=CountingSession(html),
			business_sources=[
				{
					'name': 'Photo Dedup Test',
					'city': City.VENTURA,
					'venue_type': VenueType.RESTAURANT,
					'source_url': 'https://example.com/photo-dedup-test',
				}
			],
		)

		records = importer.load_records()

		self.assertEqual(
			records[0].image_urls,
			[
				'https://example.com/images/tacos-1200x900.jpg',
				'https://example.com/images/margarita.jpg?width=800',
			],
		)

	def test_importer_extracts_background_and_data_background_images(self):
		html = """
		<html>
			<body>
				<div style="background-image: url('/images/patio-hero.jpg')"></div>
				<div data-background-image="https://example.com/images/dining-room.jpg"></div>
			</body>
		</html>
		"""

		importer = BusinessWebsiteImporter(
			session=CountingSession(html),
			business_sources=[
				{
					'name': 'Background Photo Test',
					'city': City.VENTURA,
					'venue_type': VenueType.RESTAURANT,
					'source_url': 'https://example.com/background-photo-test',
				}
			],
		)

		records = importer.load_records()

		self.assertEqual(
			records[0].image_urls,
			[
				'https://example.com/images/patio-hero.jpg',
				'https://example.com/images/dining-room.jpg',
			],
		)

	def test_importer_rejects_placeholder_video_and_page_urls(self):
		html = """
		<html>
			<body>
				<img src="https://example.com/m" alt="Menu page" />
				<img src="https://example.com/assets/transparent_placeholder.png" alt="Placeholder" />
				<img src="https://example.com/videos/hero.mp4" alt="Hero video" />
				<img src="https://example.com/images/brunch.jpg" alt="Weekend brunch" />
			</body>
		</html>
		"""

		importer = BusinessWebsiteImporter(
			session=CountingSession(html),
			business_sources=[
				{
					'name': 'Filtered Photo Test',
					'city': City.VENTURA,
					'venue_type': VenueType.RESTAURANT,
					'source_url': 'https://example.com/filtered-photo-test',
				}
			],
		)

		records = importer.load_records()

		self.assertEqual(records[0].image_urls, ['https://example.com/images/brunch.jpg'])

	def test_importer_rejects_sources_outside_supported_cities(self):
		home_html = """
		<html>
			<head>
				<script type="application/ld+json">
				{
					"@context": "https://schema.org",
					"@type": "Restaurant",
					"name": "Outside Bistro",
					"address": {
						"streetAddress": "1 Main St",
						"addressLocality": "Santa Barbara",
						"addressRegion": "CA",
						"postalCode": "93101"
					}
				}
				</script>
			</head>
			<body>
				<section class="promo">Happy Hour Monday-Friday 3pm to 6pm.</section>
			</body>
		</html>
		"""

		importer = BusinessWebsiteImporter(
			session=CountingSession(home_html),
			business_sources=[
				{
					'city': City.VENTURA,
					'venue_type': VenueType.RESTAURANT,
					'source_url': 'https://example.com/outside-bistro',
				}
			],
		)

		records = importer.load_records()

		self.assertEqual(records, [])
		self.assertEqual(len(importer.load_errors), 1)
		self.assertIn('outside supported cities', importer.load_errors[0]['error'])


class SourceListingIdentityTests(TestCase):
	def test_deal_identity_key_distinguishes_same_title_with_different_content(self):
		first_deal = ImportedDeal(
			title='Happy Hour',
			deal_type=DealType.HAPPY_HOUR,
			description='Half off appetizers from 3pm to 6pm.',
			price_text='$6 cocktails',
		)
		second_deal = ImportedDeal(
			title='Happy Hour',
			deal_type=DealType.HAPPY_HOUR,
			description='Draft beer specials after 8pm.',
			price_text='$2 off drafts',
		)

		self.assertNotEqual(_build_deal_identity_key(first_deal), _build_deal_identity_key(second_deal))

	@patch('places.services.source_listings.requests.get')
	def test_place_payload_includes_cached_coordinates(self, mock_get):
		mock_response = mock_get.return_value
		mock_response.raise_for_status.return_value = None
		mock_response.json.return_value = [{'lat': '34.2783', 'lon': '-119.2931'}]

		payload = _build_place_payload(
			ImportedPlace(
				name='805 Tacos',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='123 Main St',
				state='CA',
				postal_code='93001',
				operating_hours=[ImportedOperatingHour(weekday=Weekday.MONDAY, open_time='11:00', close_time='22:00')],
				source_name='business_websites',
				source_url='https://example.com/805-tacos',
			)
		)

		self.assertEqual(payload['latitude'], 34.2783)
		self.assertEqual(payload['longitude'], -119.2931)
		self.assertEqual(payload['image_urls'], [])
		self.assertEqual(payload['operating_hours'][0]['open_time'], '11:00')
		self.assertEqual(payload['operating_hours'][0]['close_time'], '22:00')

	@patch('places.services.source_listings.requests.get')
	def test_place_payload_prefers_imported_coordinates(self, mock_get):
		payload = _build_place_payload(
			ImportedPlace(
				name='Aloha Steakhouse',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='364 S California St',
				state='CA',
				postal_code='93001',
				latitude=34.2763384,
				longitude=-119.2929831,
				source_name='openstreetmap_places',
				source_url='https://www.openstreetmap.org/node/369154702',
			)
		)

		self.assertEqual(payload['latitude'], 34.2763384)
		self.assertEqual(payload['longitude'], -119.2929831)
		mock_get.assert_not_called()

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_place_payload_groups_multiple_locations_into_one_profile(self, mock_load_source_records, mock_get_place_coordinates):
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Lure Fish House',
				profile_name='Lure Fish House',
				profile_slug='lure-fish-house',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='60 California Street',
				state='CA',
				postal_code='93001',
				phone_number='(805) 567-4400',
				website_url='https://example.com/lure-ventura',
				image_urls=['https://example.com/lure-ventura-1.jpg'],
				source_name='business_websites',
				source_url='https://example.com/lure-ventura',
				deals=[ImportedDeal(title='Ventura Happy Hour', deal_type=DealType.HAPPY_HOUR)],
			),
			ImportedPlace(
				name='Lure Fish House Camarillo',
				profile_name='Lure Fish House',
				profile_slug='lure-fish-house',
				city=City.CAMARILLO,
				venue_type=VenueType.RESTAURANT,
				address_line_1='259 W. Ventura Blvd',
				state='CA',
				postal_code='93010',
				phone_number='(805) 388-5556',
				website_url='https://example.com/lure-camarillo',
				image_urls=['https://example.com/lure-camarillo-1.jpg'],
				source_name='business_websites',
				source_url='https://example.com/lure-camarillo',
				deals=[ImportedDeal(title='Camarillo Happy Hour', deal_type=DealType.HAPPY_HOUR)],
			),
		]
		mock_get_place_coordinates.side_effect = [(34.2801, -119.2929), (34.2187, -119.0739)]

		payloads = get_source_place_payloads()

		self.assertEqual(len(payloads), 1)
		self.assertEqual(payloads[0]['slug'], 'lure-fish-house')

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_place_payload_marks_claimed_businesses(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.return_value = (34.2783, -119.2931)
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Claimed Cafe',
				profile_name='Claimed Cafe',
				profile_slug='claimed-cafe',
				city=City.VENTURA,
				venue_type=VenueType.CAFE,
				address_line_1='123 Main St',
				state='CA',
				postal_code='93001',
				source_name='business_websites',
				source_url='https://example.com/claimed-cafe',
			),
		]
		snapshot = ListingSnapshot.objects.create(
			name='Claimed Cafe',
			listing_slug='claimed-cafe',
			city=City.VENTURA,
			venue_type=VenueType.CAFE,
			address_line_1='123 Main St',
		)
		BusinessClaim.objects.create(
			claimant=User.objects.create_user(username='claimed_owner', email='claimed-owner@example.com', password='test-pass-123'),
			listing_snapshot=snapshot,
			pathway=BusinessClaim.Pathway.CLAIMED,
			status=BusinessClaim.Status.SUBMITTED,
			contact_name='Claimed Owner',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='claimed-owner@example.com',
			work_phone='805-555-0100',
			employer_address='123 Main St',
			verification_summary='Submitted claimed business verification.',
		)

		payload = get_source_place_payload('claimed-cafe')

		self.assertIsNotNone(payload)
		self.assertTrue(payload['is_claimed'])
		self.assertFalse(payload['is_informal'])

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_place_payload_marks_approved_informal_businesses(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.return_value = (34.2783, -119.2931)
		mock_load_source_records.return_value = []
		owner = User.objects.create_user(username='informal_owner', email='informal-owner@example.com', password='test-pass-123')
		snapshot = ListingSnapshot.objects.create(
			name='Tuesday Taco Cart',
			listing_slug='tuesday-taco-cart',
			city=City.VENTURA,
			venue_type=VenueType.MOBILE,
			address_line_1='Approximate live location',
		)
		claim = BusinessClaim.objects.create(
			claimant=owner,
			listing_snapshot=snapshot,
			pathway=BusinessClaim.Pathway.INFORMAL,
			status=BusinessClaim.Status.APPROVED,
			contact_name='Taco Owner',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='informal-owner@example.com',
			work_phone='805-555-0155',
			employer_address='Ventura, CA',
			verification_summary='Approved informal vendor claim.',
		)
		BusinessMembership.objects.create(claim=claim, user=owner, is_active=True)

		payload = get_source_place_payload('tuesday-taco-cart')

		self.assertIsNotNone(payload)
		self.assertTrue(payload['is_claimed'])
		self.assertTrue(payload['is_informal'])

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_public_place_payload_prefers_approved_claim_overrides_after_snapshot_refresh(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.return_value = (34.2001, -119.1806)
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Yard House',
				profile_name='Yard House',
				profile_slug='yard-house',
				city=City.OXNARD,
				venue_type=VenueType.BAR,
				address_line_1='501 Collection Blvd Ste # 4130',
				state='CA',
				postal_code='93036',
				website_url='https://imported.example.com/yard-house',
				source_name='business_websites',
				source_url='https://imported.example.com/yard-house',
			),
		]
		owner = User.objects.create_user(username='yard_owner', email='yard-owner@example.com', password='test-pass-123')
		snapshot = ListingSnapshot.objects.create(
			name='Yard House',
			listing_slug='yard-house',
			city=City.OXNARD,
			venue_type=VenueType.BAR,
			address_line_1='501 Collection Blvd Ste # 4130',
			address_line_2='Suite 100',
			neighborhood='The Collection',
			postal_code='93036',
			website_url='https://imported.example.com/yard-house',
		)
		claim = BusinessClaim.objects.create(
			claimant=owner,
			listing_snapshot=snapshot,
			pathway=BusinessClaim.Pathway.CLAIMED,
			status=BusinessClaim.Status.APPROVED,
			contact_name='Owner Name',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='owner@yardhouse.example.com',
			work_phone='805-555-0211',
			employer_address='777 Owner Way',
			business_website_url='https://owner.example.com/yard-house',
			social_profiles={
				'website': {
					'url': 'https://owner.example.com/yard-house',
					'username': 'owner.example.com',
				},
				'instagram': {
					'url': 'https://instagram.com/yardhouseoxnard',
					'username': 'yardhouseoxnard',
				},
			},
			offer_entries=['Late night appetizers half off'],
			hours_of_operation_entries=['Sun-Thu 11am-11pm'],
			photo_references=['https://images.example.com/yard-house-front.jpg'],
			supporting_details='Owner-managed specials and updates.',
			verification_summary='Approved claimed business verification.',
		)
		BusinessMembership.objects.create(claim=claim, user=owner, is_active=True)

		snapshot.website_url = 'https://imported.example.com/yard-house-refreshed'
		snapshot.address_line_1 = '999 Admin Plaza'
		snapshot.address_line_2 = 'Suite 500'
		snapshot.neighborhood = 'Collection District'
		snapshot.postal_code = '93030'
		snapshot.save(update_fields=['website_url', 'address_line_1', 'address_line_2', 'neighborhood', 'postal_code', 'updated_at'])

		payload = get_source_place_payload('yard-house')

		self.assertIsNotNone(payload)
		self.assertEqual(payload['website_url'], 'https://owner.example.com/yard-house')
		self.assertEqual(payload['locations'][0]['website_url'], 'https://owner.example.com/yard-house')
		self.assertEqual(
			payload['social_profiles'],
			{
				'website': {
					'url': 'https://owner.example.com/yard-house',
					'username': 'owner.example.com',
				},
				'instagram': {
					'url': 'https://instagram.com/yardhouseoxnard',
					'username': 'yardhouseoxnard',
				},
			},
		)
		self.assertEqual(payload['social_media_links'], ['https://instagram.com/yardhouseoxnard'])
		self.assertEqual(payload['offer_entries'], ['Late night appetizers half off'])
		self.assertEqual(payload['hours_of_operation_entries'], ['Sun-Thu 11am-11pm'])
		self.assertEqual(payload['address_line_1'], '777 Owner Way')
		self.assertEqual(payload['address_line_2'], '')
		self.assertEqual(payload['neighborhood'], '')
		self.assertEqual(payload['postal_code'], '93036')
		self.assertEqual(payload['phone_number'], '805-555-0211')
		self.assertEqual(payload['locations'][0]['address_line_1'], '777 Owner Way')
		self.assertEqual(payload['locations'][0]['phone_number'], '805-555-0211')
		self.assertEqual(payload['photo_references'], ['https://images.example.com/yard-house-front.jpg'])
		self.assertEqual(payload['supporting_details'], 'Owner-managed specials and updates.')
		self.assertIn('https://images.example.com/yard-house-front.jpg', payload['image_urls'])

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_public_place_payload_moves_snapshot_facebook_link_into_socials_for_unclaimed_businesses(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.return_value = (34.2783, -119.2931)
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Cafe 805',
				profile_name='Cafe 805',
				profile_slug='cafe-805',
				city=City.VENTURA,
				venue_type=VenueType.CAFE,
				address_line_1='123 Main St',
				state='CA',
				postal_code='93001',
				website_url='https://facebook.com/cafe805',
				external_id='here:cafe-805',
				source_name='here_places',
				source_url='https://facebook.com/cafe805',
			),
		]
		ListingSnapshot.objects.create(
			name='Cafe 805',
			listing_slug='cafe-805',
			city=City.VENTURA,
			venue_type=VenueType.CAFE,
			address_line_1='123 Main St',
			source_name='here_places',
			external_id='here:cafe-805',
			website_url='',
			source_url='',
			social_profiles={
				'facebook': {
					'url': 'https://facebook.com/cafe805',
					'username': 'cafe805',
				},
			},
			social_media_links=['https://facebook.com/cafe805'],
		)

		payload = get_source_place_payload('cafe-805')

		self.assertIsNotNone(payload)
		self.assertEqual(payload['website_url'], '')
		self.assertEqual(payload['locations'][0]['website_url'], '')
		self.assertEqual(
			payload['social_profiles'],
			{
				'facebook': {
					'url': 'https://facebook.com/cafe805',
					'username': 'cafe805',
				},
			},
		)
		self.assertEqual(payload['social_media_links'], ['https://facebook.com/cafe805'])

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_public_place_payload_replaces_pulled_deals_and_hours_with_structured_claim_overrides(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.return_value = (34.2001, -119.1806)
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Yard House',
				profile_name='Yard House',
				profile_slug='yard-house',
				city=City.OXNARD,
				venue_type=VenueType.BAR,
				address_line_1='501 Collection Blvd Ste # 4130',
				state='CA',
				postal_code='93036',
				website_url='https://imported.example.com/yard-house',
				source_name='business_websites',
				source_url='https://imported.example.com/yard-house',
				operating_hours=[ImportedOperatingHour(weekday=Weekday.MONDAY, open_time='11:00', close_time='23:00')],
				deals=[ImportedDeal(title='Imported Happy Hour', deal_type=DealType.HAPPY_HOUR, happy_hours=[ImportedHappyHour(weekday=Weekday.MONDAY, start_time='15:00', end_time='18:00')])],
			),
		]
		owner = User.objects.create_user(username='yard_override_owner', email='yard-override-owner@example.com', password='test-pass-123')
		snapshot = ListingSnapshot.objects.create(
			name='Yard House',
			listing_slug='yard-house',
			city=City.OXNARD,
			venue_type=VenueType.BAR,
			address_line_1='501 Collection Blvd Ste # 4130',
		)
		claim = BusinessClaim.objects.create(
			claimant=owner,
			listing_snapshot=snapshot,
			pathway=BusinessClaim.Pathway.CLAIMED,
			status=BusinessClaim.Status.APPROVED,
			contact_name='Owner Name',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='owner@yardhouse.example.com',
			work_phone='805-555-0100',
			employer_address='501 Collection Blvd Ste # 4130',
			deal_overrides=[{
				'title': 'Owner Happy Hour',
				'description': '$2 off cocktails and appetizers',
				'deal_type': DealType.HAPPY_HOUR,
				'price_text': '$2 Off',
				'terms': 'Dine-in only',
				'happy_hours': [{'weekday': Weekday.FRIDAY, 'start_time': '16:00', 'end_time': '19:00', 'all_day': False}],
			}],
			operating_hour_overrides=[{'weekday': Weekday.FRIDAY, 'open_time': '10:00', 'close_time': '22:00'}],
			verification_summary='Approved claimed business verification.',
		)
		BusinessMembership.objects.create(claim=claim, user=owner, is_active=True)

		payload = get_source_place_payload('yard-house')

		self.assertEqual(len(payload['deals']), 1)
		self.assertEqual(payload['deals'][0]['title'], 'Owner Happy Hour')
		self.assertEqual(payload['deals'][0]['happy_hours'][0]['weekday'], Weekday.FRIDAY)
		self.assertEqual(payload['operating_hours'], [{
			'id': payload['operating_hours'][0]['id'],
			'weekday': Weekday.FRIDAY,
			'weekday_label': 'Friday',
			'open_time': '10:00',
			'close_time': '22:00',
			'open_24_hours': False,
			'group_id': None,
			'group_rank': None,
		}])
		self.assertEqual(payload['offer_entries'], [])
		self.assertEqual(payload['hours_of_operation_entries'], [])

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_public_place_payload_marks_24_hour_claim_overrides(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.return_value = (34.2001, -119.1806)
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Night Owl Diner',
				profile_name='Night Owl Diner',
				profile_slug='night-owl-diner',
				city=City.OXNARD,
				venue_type=VenueType.RESTAURANT,
				address_line_1='100 Harbor Blvd',
				state='CA',
				postal_code='93035',
				website_url='https://imported.example.com/night-owl-diner',
				source_name='business_websites',
				source_url='https://imported.example.com/night-owl-diner',
			),
		]
		owner = User.objects.create_user(username='night_owl_owner', email='night-owl-owner@example.com', password='test-pass-123')
		snapshot = ListingSnapshot.objects.create(
			name='Night Owl Diner',
			listing_slug='night-owl-diner',
			city=City.OXNARD,
			venue_type=VenueType.RESTAURANT,
			address_line_1='100 Harbor Blvd',
		)
		claim = BusinessClaim.objects.create(
			claimant=owner,
			listing_snapshot=snapshot,
			pathway=BusinessClaim.Pathway.CLAIMED,
			status=BusinessClaim.Status.APPROVED,
			contact_name='Owner Name',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='owner@nightowl.example.com',
			work_phone='805-555-0100',
			employer_address='100 Harbor Blvd',
			operating_hour_overrides=[{'weekday': Weekday.SATURDAY, 'open_24_hours': True}],
			verification_summary='Approved claimed business verification.',
		)
		BusinessMembership.objects.create(claim=claim, user=owner, is_active=True)

		payload = get_source_place_payload('night-owl-diner')

		self.assertEqual(payload['operating_hours'], [{
			'id': payload['operating_hours'][0]['id'],
			'weekday': Weekday.SATURDAY,
			'weekday_label': 'Saturday',
			'open_time': '00:00',
			'close_time': '23:59',
			'open_24_hours': True,
			'group_id': None,
			'group_rank': None,
		}])

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_public_place_payload_applies_unclaimed_listing_snapshot_overrides(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.return_value = (34.2001, -119.1806)
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Yard House',
				profile_name='Yard House',
				profile_slug='yard-house',
				city=City.OXNARD,
				venue_type=VenueType.BAR,
				address_line_1='501 Collection Blvd Ste # 4130',
				state='CA',
				postal_code='93036',
				website_url='https://imported.example.com/yard-house',
				source_name='business_websites',
				source_url='https://imported.example.com/yard-house',
				operating_hours=[ImportedOperatingHour(weekday=Weekday.MONDAY, open_time='11:00', close_time='23:00')],
				deals=[ImportedDeal(title='Imported Happy Hour', deal_type=DealType.HAPPY_HOUR, happy_hours=[ImportedHappyHour(weekday=Weekday.MONDAY, start_time='15:00', end_time='18:00')])],
			),
		]
		ListingSnapshot.objects.create(
			name='Yard House',
			listing_slug='yard-house',
			city=City.OXNARD,
			venue_type=VenueType.BAR,
			address_line_1='999 Admin Plaza',
			address_line_2='Suite 500',
			neighborhood='Collection District',
			postal_code='93030',
			imported_image_urls=['https://images.example.com/yard-house-imported.jpg'],
			deal_overrides=[{
				'title': 'Admin Happy Hour',
				'description': '$3 off cocktails and apps',
				'deal_type': DealType.HAPPY_HOUR,
				'price_text': '$3 Off',
				'terms': 'Dine-in only',
				'happy_hours': [{'weekday': Weekday.THURSDAY, 'start_time': '15:00', 'end_time': '18:00', 'all_day': False}],
			}],
			operating_hour_overrides=[{'weekday': Weekday.THURSDAY, 'open_time': '11:00', 'close_time': '22:00'}],
		)

		payload = get_source_place_payload('yard-house')

		self.assertEqual(len(payload['deals']), 1)
		self.assertEqual(payload['deals'][0]['title'], 'Admin Happy Hour')
		self.assertEqual(payload['deals'][0]['happy_hours'][0]['weekday'], Weekday.THURSDAY)
		self.assertEqual(payload['operating_hours'][0]['weekday'], Weekday.THURSDAY)
		self.assertEqual(payload['address_line_1'], '999 Admin Plaza')
		self.assertEqual(payload['address_line_2'], 'Suite 500')
		self.assertEqual(payload['neighborhood'], 'Collection District')
		self.assertEqual(payload['postal_code'], '93030')
		self.assertEqual(payload['locations'][0]['address_line_1'], '999 Admin Plaza')
		self.assertEqual(payload['locations'][0]['address_line_2'], 'Suite 500')
		self.assertEqual(payload['locations'][0]['neighborhood'], 'Collection District')
		self.assertEqual(payload['locations'][0]['postal_code'], '93030')
		self.assertEqual(payload['image_urls'], ['https://images.example.com/yard-house-imported.jpg'])
		self.assertEqual(payload['locations'][0]['image_urls'], ['https://images.example.com/yard-house-imported.jpg'])

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_public_place_payload_uses_custom_other_deal_type_label_from_snapshot_override(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.return_value = (34.2001, -119.1806)
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Yard House',
				profile_name='Yard House',
				profile_slug='yard-house',
				city=City.OXNARD,
				venue_type=VenueType.BAR,
				address_line_1='501 Collection Blvd Ste # 4130',
				state='CA',
				postal_code='93036',
				website_url='https://imported.example.com/yard-house',
				source_name='business_websites',
				source_url='https://imported.example.com/yard-house',
			),
		]
		ListingSnapshot.objects.create(
			name='Yard House',
			listing_slug='yard-house',
			city=City.OXNARD,
			venue_type=VenueType.BAR,
			address_line_1='501 Collection Blvd Ste # 4130',
			deal_overrides=[{
				'title': 'Trivia Night Combo',
				'description': 'Pizza, pitcher, and reserved seating.',
				'deal_type': DealType.OTHER,
				'custom_deal_type_label': 'Event Special',
				'price_text': '$35',
				'terms': '',
				'happy_hours': [],
			}],
		)

		payload = get_source_place_payload('yard-house')

		self.assertEqual(payload['deals'][0]['deal_type'], DealType.OTHER)
		self.assertEqual(payload['deals'][0]['deal_type_label'], 'Event Special')

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_public_place_payload_preserves_imported_deals_when_snapshot_has_no_structured_overrides(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.return_value = (34.21681, -119.07423)
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Institution Ale Co.',
				profile_name='Institution Ale Co.',
				profile_slug='institution-ale-co',
				city=City.CAMARILLO,
				venue_type=VenueType.BAR,
				address_line_1='311 Leisure Village Dr',
				state='CA',
				postal_code='93012',
				phone_number='805-555-0100',
				website_url='https://institution.example.com/camarillo',
				source_name='business_websites',
				source_url='https://institution.example.com/camarillo',
				deals=[ImportedDeal(title='Imported Happy Hour', deal_type=DealType.HAPPY_HOUR, happy_hours=[ImportedHappyHour(weekday=Weekday.MONDAY, start_time='15:00', end_time='18:00')])],
				operating_hours=[ImportedOperatingHour(weekday=Weekday.MONDAY, open_time='11:00', close_time='22:00')],
			),
		]
		ListingSnapshot.objects.create(
			name='Institution Ale Co.',
			listing_slug='institution-ale-co',
			city=City.CAMARILLO,
			venue_type=VenueType.BAR,
			address_line_1='311 Leisure Village Dr',
			phone_number='805-555-9999',
		)

		payload = get_source_place_payload('institution-ale-co')

		self.assertEqual(payload['phone_number'], '805-555-9999')
		self.assertTrue(payload['has_deals'])
		self.assertEqual(payload['deal_count'], 1)
		self.assertEqual(payload['deals'][0]['title'], 'Imported Happy Hour')
		self.assertEqual(payload['operating_hours'][0]['weekday'], Weekday.MONDAY)

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_multi_location_snapshot_slug_override_does_not_replace_other_locations(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.side_effect = [
			(34.2785, -119.2931),
			(34.2168, -119.0376),
		]
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Lure Fish House',
				profile_name='Lure Fish House',
				profile_slug='lure-fish-house',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='60 California Street',
				state='CA',
				postal_code='93001',
				website_url='https://www.lurefishhouse.com/location/lure-fish-house-ventura/',
				source_name='business_websites',
				source_url='https://www.lurefishhouse.com/location/lure-fish-house-ventura/',
				external_id='lure-ventura',
				deals=[ImportedDeal(title='Ventura Happy Hour', deal_type=DealType.HAPPY_HOUR, happy_hours=[ImportedHappyHour(weekday=Weekday.MONDAY, start_time='15:00', end_time='18:00')])],
			),
			ImportedPlace(
				name='Lure Fish House Camarillo',
				profile_name='Lure Fish House',
				profile_slug='lure-fish-house',
				city=City.CAMARILLO,
				venue_type=VenueType.RESTAURANT,
				address_line_1='259 W. Ventura Blvd',
				state='CA',
				postal_code='93010',
				website_url='https://www.lurefishhouse.com/location/lure-fish-house-camarillo/',
				source_name='business_websites',
				source_url='https://www.lurefishhouse.com/location/lure-fish-house-camarillo/',
				external_id='lure-camarillo',
				deals=[ImportedDeal(title='Camarillo Happy Hour', deal_type=DealType.HAPPY_HOUR, happy_hours=[ImportedHappyHour(weekday=Weekday.TUESDAY, start_time='15:00', end_time='18:00')])],
			),
		]
		ListingSnapshot.objects.create(
			name='Lure Fish House',
			listing_slug='lure-fish-house',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='60 California Street',
			source_name='business_websites',
			external_id='lure-ventura',
		)
		ListingSnapshot.objects.create(
			name='Lure Fish House',
			listing_slug='lure-fish-house',
			city=City.CAMARILLO,
			venue_type=VenueType.RESTAURANT,
			address_line_1='259 W. Ventura Blvd',
			source_name='business_websites',
			external_id='lure-camarillo',
		)

		payload = get_source_place_payload('lure-fish-house')

		self.assertEqual(len(payload['locations']), 2)
		location_pairs = {(location['city'], location['address_line_1']) for location in payload['locations']}
		self.assertEqual(location_pairs, {
			(City.VENTURA, '60 California Street'),
			(City.CAMARILLO, '259 W. Ventura Blvd'),
		})

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_public_place_payload_allows_snapshot_to_explicitly_clear_imported_deals(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.return_value = (34.21681, -119.07423)
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='La Cascada',
				profile_name='La Cascada',
				profile_slug='la-cascada',
				city=City.CAMARILLO,
				venue_type=VenueType.RESTAURANT,
				address_line_1='435 Arneill Rd',
				state='CA',
				postal_code='93010',
				phone_number='805-555-0111',
				website_url='https://lacascada.example.com',
				source_name='business_websites',
				source_url='https://lacascada.example.com',
				deals=[ImportedDeal(title='Imported Happy Hour', deal_type=DealType.HAPPY_HOUR, happy_hours=[ImportedHappyHour(weekday=Weekday.MONDAY, start_time='15:00', end_time='18:00')])],
			),
		]
		ListingSnapshot.objects.create(
			name='La Cascada',
			listing_slug='la-cascada',
			city=City.CAMARILLO,
			venue_type=VenueType.RESTAURANT,
			address_line_1='435 Arneill Rd',
			deal_overrides=[],
			deal_overrides_cleared=True,
		)

		payload = get_source_place_payload('la-cascada')

		self.assertFalse(payload['has_deals'])
		self.assertEqual(payload['deal_count'], 0)
		self.assertEqual(payload['deals'], [])

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_public_place_payload_ignores_legacy_empty_snapshot_deal_overrides_without_clear_flag(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.return_value = (34.21681, -119.07423)
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Legacy Empty Override Cafe',
				profile_name='Legacy Empty Override Cafe',
				profile_slug='legacy-empty-override-cafe',
				city=City.CAMARILLO,
				venue_type=VenueType.CAFE,
				address_line_1='10 Main St',
				state='CA',
				postal_code='93010',
				website_url='https://legacy-empty.example.com',
				source_name='business_websites',
				source_url='https://legacy-empty.example.com',
				deals=[ImportedDeal(title='Imported Happy Hour', deal_type=DealType.HAPPY_HOUR, happy_hours=[ImportedHappyHour(weekday=Weekday.MONDAY, start_time='15:00', end_time='18:00')])],
			),
		]
		ListingSnapshot.objects.create(
			name='Legacy Empty Override Cafe',
			listing_slug='legacy-empty-override-cafe',
			city=City.CAMARILLO,
			venue_type=VenueType.CAFE,
			address_line_1='10 Main St',
			deal_overrides=[],
			deal_overrides_cleared=False,
		)

		payload = get_source_place_payload('legacy-empty-override-cafe')

		self.assertTrue(payload['has_deals'])
		self.assertEqual(payload['deal_count'], 1)
		self.assertEqual(payload['deals'][0]['title'], 'Imported Happy Hour')

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_public_place_payload_preserves_imported_deals_when_claim_has_no_structured_overrides(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.return_value = (34.2001, -119.1806)
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Yard House',
				profile_name='Yard House',
				profile_slug='yard-house',
				city=City.OXNARD,
				venue_type=VenueType.BAR,
				address_line_1='501 Collection Blvd Ste # 4130',
				state='CA',
				postal_code='93036',
				website_url='https://imported.example.com/yard-house',
				source_name='business_websites',
				source_url='https://imported.example.com/yard-house',
				deals=[ImportedDeal(title='Imported Happy Hour', deal_type=DealType.HAPPY_HOUR, happy_hours=[ImportedHappyHour(weekday=Weekday.MONDAY, start_time='15:00', end_time='18:00')])],
			),
		]
		snapshot = ListingSnapshot.objects.create(
			name='Yard House',
			listing_slug='yard-house',
			city=City.OXNARD,
			venue_type=VenueType.BAR,
			address_line_1='501 Collection Blvd Ste # 4130',
		)
		owner = User.objects.create_user(username='owner-no-override', password='password123')
		claim = BusinessClaim.objects.create(
			claimant=owner,
			listing_snapshot=snapshot,
			pathway=BusinessClaim.Pathway.CLAIMED,
			status=BusinessClaim.Status.APPROVED,
			contact_name='Owner Name',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='owner@yardhouse.example.com',
			work_phone='805-555-0100',
			employer_address='501 Collection Blvd Ste # 4130',
			verification_summary='Approved claimed business verification.',
		)
		BusinessMembership.objects.create(claim=claim, user=owner, is_active=True)

		payload = get_source_place_payload('yard-house')

		self.assertTrue(payload['is_claimed'])
		self.assertTrue(payload['has_deals'])
		self.assertEqual(payload['deal_count'], 1)
		self.assertEqual(payload['deals'][0]['title'], 'Imported Happy Hour')

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_public_place_payload_applies_unclaimed_listing_snapshot_website_override(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.return_value = (34.2001, -119.1806)
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Yard House',
				profile_name='Yard House',
				profile_slug='yard-house',
				city=City.OXNARD,
				venue_type=VenueType.BAR,
				address_line_1='501 Collection Blvd Ste # 4130',
				state='CA',
				postal_code='93036',
				website_url='https://imported.example.com/yard-house',
				source_name='business_websites',
				source_url='https://imported.example.com/yard-house',
			),
		]
		ListingSnapshot.objects.create(
			name='Yard House',
			listing_slug='yard-house',
			city=City.OXNARD,
			venue_type=VenueType.BAR,
			address_line_1='501 Collection Blvd Ste # 4130',
			website_url='https://admin.example.com/yard-house',
		)

		payload = get_source_place_payload('yard-house')

		self.assertEqual(payload['website_url'], 'https://admin.example.com/yard-house')
		self.assertEqual(payload['locations'][0]['website_url'], 'https://admin.example.com/yard-house')

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_public_place_payload_includes_unclaimed_admin_manual_submission_in_app_feed(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.return_value = (34.2783, -119.2931)
		mock_load_source_records.return_value = []
		ListingSnapshot.objects.create(
			name='Ventura Harbor Village',
			listing_slug='ventura-harbor-village-ventura',
			city=City.VENTURA,
			venue_type=VenueType.ATTRACTION,
			address_line_1='1583 Spinnaker Dr',
			state='CA',
			postal_code='93001',
			phone_number='805-477-0470',
			website_url='https://www.venturaharborvillage.com/',
			source_name=BusinessClaim.ADMIN_SOURCE_NAME,
			external_id='manual-attraction-ventura-ventura-harbor-village',
		)

		payload = get_source_place_payload('ventura-harbor-village-ventura')

		self.assertIsNotNone(payload)
		self.assertEqual(payload['name'], 'Ventura Harbor Village')
		self.assertEqual(payload['venue_type'], VenueType.ATTRACTION)
		self.assertFalse(payload['is_claimed'])
		self.assertEqual(payload['website_url'], 'https://www.venturaharborvillage.com/')

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_public_place_payload_applies_unclaimed_listing_snapshot_website_override_when_snapshot_slug_differs(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.return_value = (34.21681, -119.04423)
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='999 Pizza',
				profile_name='999 Pizza',
				profile_slug='',
				city=City.CAMARILLO,
				venue_type=VenueType.RESTAURANT,
				address_line_1='Ventura Blvd',
				state='CA',
				postal_code='93010',
				website_url='',
				external_id='here:999-pizza',
				source_name='here_places',
			),
		]
		ListingSnapshot.objects.create(
			name='999 Pizza',
			listing_slug='999-pizza-camarillo',
			city=City.CAMARILLO,
			venue_type=VenueType.RESTAURANT,
			address_line_1='Ventura Blvd',
			external_id='here:999-pizza',
			source_name='here_places',
			website_url='https://admin.example.com/999-pizza',
		)

		payload = get_source_place_payload('999-pizza')

		self.assertEqual(payload['website_url'], 'https://admin.example.com/999-pizza')
		self.assertEqual(payload['locations'][0]['website_url'], 'https://admin.example.com/999-pizza')

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_public_place_payload_applies_unclaimed_listing_snapshot_phone_override(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.return_value = (34.2001, -119.1806)
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Yard House',
				profile_name='Yard House',
				profile_slug='yard-house',
				city=City.OXNARD,
				venue_type=VenueType.BAR,
				address_line_1='501 Collection Blvd Ste # 4130',
				state='CA',
				postal_code='93036',
				phone_number='805-555-0101',
				website_url='https://imported.example.com/yard-house',
				source_name='business_websites',
				source_url='https://imported.example.com/yard-house',
			),
		]
		ListingSnapshot.objects.create(
			name='Yard House',
			listing_slug='yard-house',
			city=City.OXNARD,
			venue_type=VenueType.BAR,
			address_line_1='501 Collection Blvd Ste # 4130',
			phone_number='805-555-9999',
		)

		payload = get_source_place_payload('yard-house')

		self.assertEqual(payload['phone_number'], '805-555-9999')
		self.assertEqual(payload['locations'][0]['phone_number'], '805-555-9999')

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_public_place_payload_applies_unclaimed_listing_snapshot_name_override(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.return_value = (34.2001, -119.1806)
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Yard House',
				profile_name='Yard House',
				profile_slug='yard-house',
				city=City.OXNARD,
				venue_type=VenueType.BAR,
				address_line_1='501 Collection Blvd Ste # 4130',
				state='CA',
				postal_code='93036',
				website_url='https://imported.example.com/yard-house',
				source_name='business_websites',
				source_url='https://imported.example.com/yard-house',
			),
		]
		ListingSnapshot.objects.create(
			name='Yard House Oxnard',
			listing_slug='yard-house',
			city=City.OXNARD,
			venue_type=VenueType.BAR,
			address_line_1='501 Collection Blvd Ste # 4130',
		)

		payload = get_source_place_payload('yard-house')

		self.assertEqual(payload['name'], 'Yard House Oxnard')
		self.assertEqual(payload['locations'][0]['name'], 'Yard House Oxnard')

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_multi_location_snapshot_contact_overrides_only_affect_the_matching_location(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.side_effect = [(34.2243, -119.0382), (34.2099, -119.0901)]
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Baskin-Robbins',
				profile_name='Baskin-Robbins',
				profile_slug='',
				city=City.CAMARILLO,
				venue_type=VenueType.CAFE,
				address_line_1='738 Arneill Rd',
				state='CA',
				postal_code='93010',
				phone_number='805-555-0101',
				external_id='here:baskin-camarillo',
				source_name='here_places',
			),
			ImportedPlace(
				name='Baskin-Robbins',
				profile_name='Baskin-Robbins',
				profile_slug='',
				city=City.OXNARD,
				venue_type=VenueType.CAFE,
				address_line_1='1251 S Victoria Ave',
				state='CA',
				postal_code='93035',
				phone_number='805-555-0202',
				external_id='here:baskin-oxnard',
				source_name='here_places',
			),
		]
		ListingSnapshot.objects.create(
			name='Baskin-Robbins',
			listing_slug='baskin-robbins-camarillo',
			city=City.CAMARILLO,
			venue_type=VenueType.CAFE,
			address_line_1='738 Arneill Rd',
			postal_code='93012',
			phone_number='805-555-9999',
			external_id='here:baskin-camarillo',
			source_name='here_places',
		)

		payload = get_source_place_payload('baskin-robbins')

		self.assertEqual(payload['address_line_1'], '738 Arneill Rd')
		self.assertEqual(payload['postal_code'], '93012')
		self.assertEqual(payload['phone_number'], '805-555-9999')
		location_by_city = {location['city']: location for location in payload['locations']}
		self.assertEqual(location_by_city[City.CAMARILLO]['postal_code'], '93012')
		self.assertEqual(location_by_city[City.CAMARILLO]['phone_number'], '805-555-9999')
		self.assertEqual(location_by_city[City.OXNARD]['address_line_1'], '1251 S Victoria Ave')
		self.assertEqual(location_by_city[City.OXNARD]['postal_code'], '93035')
		self.assertEqual(location_by_city[City.OXNARD]['phone_number'], '805-555-0202')

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_multi_location_snapshot_structured_hour_overrides_only_affect_the_matching_location(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.side_effect = [(34.2171, -119.0385), (34.1975, -119.1771)]
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Baskin-Robbins',
				profile_name='Baskin-Robbins',
				profile_slug='',
				city=City.CAMARILLO,
				venue_type=VenueType.CAFE,
				address_line_1='738 Arneill Rd',
				state='CA',
				postal_code='93010',
				external_id='here:baskin-camarillo',
				source_name='here_places',
				operating_hours=[ImportedOperatingHour(weekday=Weekday.MONDAY, open_time='10:00', close_time='20:00')],
			),
			ImportedPlace(
				name='Baskin-Robbins',
				profile_name='Baskin-Robbins',
				profile_slug='',
				city=City.OXNARD,
				venue_type=VenueType.CAFE,
				address_line_1='1251 S Victoria Ave',
				state='CA',
				postal_code='93035',
				external_id='here:baskin-oxnard',
				source_name='here_places',
				operating_hours=[ImportedOperatingHour(weekday=Weekday.TUESDAY, open_time='11:00', close_time='21:00')],
			),
		]
		ListingSnapshot.objects.create(
			name='Baskin-Robbins',
			listing_slug='baskin-robbins-camarillo',
			city=City.CAMARILLO,
			venue_type=VenueType.CAFE,
			address_line_1='738 Arneill Rd',
			external_id='here:baskin-camarillo',
			source_name='here_places',
			operating_hour_overrides=[{'weekday': Weekday.FRIDAY, 'open_time': '12:00', 'close_time': '22:00'}],
		)

		payload = get_source_place_payload('baskin-robbins')

		location_by_city = {location['city']: location for location in payload['locations']}
		self.assertEqual(location_by_city[City.CAMARILLO]['operating_hours'][0]['weekday'], Weekday.FRIDAY)
		self.assertEqual(location_by_city[City.CAMARILLO]['operating_hours'][0]['open_time'], '12:00')
		self.assertEqual(location_by_city[City.OXNARD]['operating_hours'][0]['weekday'], Weekday.TUESDAY)
		self.assertEqual(location_by_city[City.OXNARD]['operating_hours'][0]['open_time'], '11:00')

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_claim_override_takes_precedence_over_listing_snapshot_overrides(self, mock_load_source_records, mock_get_place_coordinates):
		mock_get_place_coordinates.return_value = (34.2001, -119.1806)
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Yard House',
				profile_name='Yard House',
				profile_slug='yard-house',
				city=City.OXNARD,
				venue_type=VenueType.BAR,
				address_line_1='501 Collection Blvd Ste # 4130',
				state='CA',
				postal_code='93036',
				website_url='https://imported.example.com/yard-house',
				source_name='business_websites',
				source_url='https://imported.example.com/yard-house',
			),
		]
		owner = User.objects.create_user(username='yard_snapshot_owner', email='yard-snapshot-owner@example.com', password='test-pass-123')
		snapshot = ListingSnapshot.objects.create(
			name='Yard House Owner Edition',
			listing_slug='yard-house',
			city=City.OXNARD,
			venue_type=VenueType.BAR,
			address_line_1='501 Collection Blvd Ste # 4130',
			deal_overrides=[{
				'title': 'Admin Happy Hour',
				'description': '$3 off cocktails and apps',
				'deal_type': DealType.HAPPY_HOUR,
				'price_text': '$3 Off',
				'terms': 'Admin only',
				'happy_hours': [{'weekday': Weekday.THURSDAY, 'start_time': '15:00', 'end_time': '18:00', 'all_day': False}],
			}],
		)
		claim = BusinessClaim.objects.create(
			claimant=owner,
			listing_snapshot=snapshot,
			pathway=BusinessClaim.Pathway.CLAIMED,
			status=BusinessClaim.Status.APPROVED,
			contact_name='Owner Name',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='owner@yardhouse.example.com',
			work_phone='805-555-0100',
			employer_address='501 Collection Blvd Ste # 4130',
			deal_overrides=[{
				'title': 'Owner Happy Hour',
				'description': '$2 off cocktails and appetizers',
				'deal_type': DealType.HAPPY_HOUR,
				'price_text': '$2 Off',
				'terms': 'Dine-in only',
				'happy_hours': [{'weekday': Weekday.FRIDAY, 'start_time': '16:00', 'end_time': '19:00', 'all_day': False}],
			}],
			verification_summary='Approved claimed business verification.',
		)
		BusinessMembership.objects.create(claim=claim, user=owner, is_active=True)

		payload = get_source_place_payload('yard-house')

		self.assertEqual(payload['name'], 'Yard House Owner Edition')
		self.assertEqual(payload['locations'][0]['name'], 'Yard House Owner Edition')
		self.assertEqual(payload['deals'][0]['title'], 'Owner Happy Hour')
		self.assertEqual(payload['deals'][0]['happy_hours'][0]['weekday'], Weekday.FRIDAY)

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_place_payload_merges_matching_profiles_across_sources(self, mock_load_source_records, mock_get_place_coordinates):
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Lure Fish House',
				profile_name='Lure Fish House',
				profile_slug='lure-fish-house',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='60 California Street',
				state='CA',
				postal_code='93001',
				phone_number='(805) 567-4400',
				website_url='https://lurefishhouse.com/ventura',
				source_name='business_websites',
				source_url='https://lurefishhouse.com/ventura',
				deals=[ImportedDeal(title='Ventura Happy Hour', deal_type=DealType.HAPPY_HOUR)],
			),
			ImportedPlace(
				name='Lure Fish House',
				profile_name='Lure Fish House',
				profile_slug='lure-fish-house',
				city=City.CAMARILLO,
				venue_type=VenueType.RESTAURANT,
				address_line_1='259 W Ventura Blvd',
				state='CA',
				postal_code='93010',
				phone_number='(805) 388-5556',
				website_url='http://www.lurefishhouse.com',
				source_name='here_places',
				source_url='https://discover.search.hereapi.com/v1/discover',
			),
		]
		mock_get_place_coordinates.side_effect = [(34.2801, -119.2929), (34.2187, -119.0739)]

		payloads = get_source_place_payloads()

		self.assertEqual(len(payloads), 1)
		self.assertEqual(payloads[0]['slug'], 'lure-fish-house')
		self.assertEqual(payloads[0]['name'], 'Lure Fish House')
		self.assertEqual(len(payloads[0]['locations']), 2)
		self.assertEqual({location['city'] for location in payloads[0]['locations']}, {City.VENTURA, City.CAMARILLO})

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_place_payload_prefers_full_address_over_partial_same_business_location(self, mock_load_source_records, mock_get_place_coordinates):
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Lure Fish House',
				profile_name='Lure Fish House',
				profile_slug='lure-fish-house',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='60 California Street',
				state='CA',
				postal_code='93001',
				phone_number='(805) 567-4400',
				website_url='https://lurefishhouse.com/ventura',
				source_name='business_websites',
				source_url='https://lurefishhouse.com/ventura',
			),
			ImportedPlace(
				name='Lure Fish House',
				profile_name='Lure Fish House',
				profile_slug='lure-fish-house',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='S California St',
				state='CA',
				postal_code='93001-2595',
				phone_number='(805) 567-4400',
				website_url='http://www.lurefishhouse.com',
				source_name='here_places',
				source_url='https://discover.search.hereapi.com/v1/discover',
			),
		]
		mock_get_place_coordinates.side_effect = [(34.2801, -119.2929), (34.28011, -119.2928)]

		payloads = get_source_place_payloads()

		self.assertEqual(len(payloads), 1)
		self.assertEqual(len(payloads[0]['locations']), 1)
		self.assertEqual(payloads[0]['locations'][0]['address_line_1'], '60 California Street')

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_place_payload_merges_same_slug_name_variants_without_losing_distinct_locations(self, mock_load_source_records, mock_get_place_coordinates):
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Cronies Sports Grill',
				profile_name='Cronies Sports Grill',
				city=City.VENTURA,
				venue_type=VenueType.BAR,
				address_line_1='2855 Johnson Dr',
				state='CA',
				postal_code='93003',
				website_url='https://example.com/cronies-ventura',
				source_name='business_websites',
				source_url='https://example.com/cronies-ventura',
			),
			ImportedPlace(
				name="Cronie's Sports Grill",
				profile_name="Cronie's Sports Grill",
				city=City.CAMARILLO,
				venue_type=VenueType.BAR,
				address_line_1='N Lantana St',
				state='CA',
				postal_code='93010',
				source_name='here_places',
				source_url='https://discover.search.hereapi.com/v1/discover',
			),
			ImportedPlace(
				name='Cronies Sports Grill Camarillo',
				profile_name='Cronies Sports Grill',
				city=City.CAMARILLO,
				venue_type=VenueType.BAR,
				address_line_1='370 N Lantana St',
				state='CA',
				postal_code='93010',
				website_url='https://example.com/cronies-camarillo',
				source_name='business_websites',
				source_url='https://example.com/cronies-camarillo',
			),
		]
		mock_get_place_coordinates.side_effect = [(34.2477, -119.1965), (34.2195, -119.0545), (34.2196, -119.0544)]

		payloads = get_source_place_payloads()

		self.assertEqual(len(payloads), 1)
		self.assertEqual(payloads[0]['slug'], 'cronies-sports-grill')
		self.assertEqual(payloads[0]['name'], 'Cronies Sports Grill')
		self.assertEqual(len(payloads[0]['locations']), 2)
		self.assertEqual(
			{location['address_line_1'] for location in payloads[0]['locations']},
			{'2855 Johnson Dr', '370 N Lantana St'},
		)

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_place_payloads_include_profiles_with_and_without_verified_deals(self, mock_load_source_records, mock_get_place_coordinates):
		coordinates_by_address = {
			'123 Main St': (34.2783, -119.2931),
			'456 Ventura Blvd': (34.2187, -119.0739),
			'789 Harbor Blvd': (34.1975, -119.1771),
		}

		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Deal Spot Ventura',
				profile_name='Deal Spot',
				profile_slug='deal-spot',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='123 Main St',
				state='CA',
				postal_code='93001',
				source_name='business_websites',
				source_url='https://example.com/deal-spot-ventura',
				deals=[ImportedDeal(title='Happy Hour', deal_type=DealType.HAPPY_HOUR)],
			),
			ImportedPlace(
				name='Deal Spot Camarillo',
				profile_name='Deal Spot',
				profile_slug='deal-spot',
				city=City.CAMARILLO,
				venue_type=VenueType.RESTAURANT,
				address_line_1='456 Ventura Blvd',
				state='CA',
				postal_code='93010',
				source_name='here_places',
				source_url='https://discover.search.hereapi.com/v1/discover',
				deals=[ImportedDeal(title='Late Night', deal_type=DealType.DAILY_SPECIAL)],
			),
			ImportedPlace(
				name='No Deal Cafe',
				city=City.OXNARD,
				venue_type=VenueType.CAFE,
				address_line_1='789 Harbor Blvd',
				state='CA',
				postal_code='93035',
				source_name='here_places',
				source_url='https://discover.search.hereapi.com/v1/discover',
			),
		]
		mock_get_place_coordinates.side_effect = lambda place_record, resolve_missing=True: coordinates_by_address[place_record.address_line_1]

		payloads = get_source_place_payloads()

		self.assertEqual(len(payloads), 2)
		self.assertEqual(payloads[0]['slug'], 'deal-spot')
		self.assertEqual(len(payloads[0]['locations']), 2)
		self.assertEqual([deal['title'] for deal in payloads[0]['deals']], ['Late Night', 'Happy Hour'])
		self.assertTrue(payloads[0]['has_deals'])
		self.assertEqual(payloads[0]['deal_count'], 2)
		self.assertEqual(payloads[0]['operating_weekdays'], [])
		self.assertEqual(payloads[0]['deal_weekdays'], [])
		self.assertTrue(payloads[0]['is_verified'])
		self.assertEqual(payloads[1]['slug'], 'no-deal-cafe')
		self.assertFalse(payloads[1]['has_deals'])
		self.assertEqual(payloads[1]['deal_count'], 0)
		self.assertFalse(payloads[1]['is_verified'])

		verified_payloads = get_source_place_payloads(has_deals=True)
		self.assertEqual(len(verified_payloads), 1)
		self.assertEqual(verified_payloads[0]['slug'], 'deal-spot')

		unverified_payloads = get_source_place_payloads(has_deals=False)
		self.assertEqual(len(unverified_payloads), 1)
		self.assertEqual(unverified_payloads[0]['slug'], 'no-deal-cafe')

	@patch('places.services.source_listings._get_place_coordinates')
	@patch('places.services.source_listings.load_source_records')
	def test_place_payloads_can_skip_resolving_missing_coordinates(self, mock_load_source_records, mock_get_place_coordinates):
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Slow Lookup Cafe',
				city=City.VENTURA,
				venue_type=VenueType.CAFE,
				address_line_1='123 Main St',
				state='CA',
				postal_code='93001',
				source_name='business_websites',
				source_url='https://example.com/slow-lookup-cafe',
			),
		]

		mock_get_place_coordinates.return_value = (None, None)

		payloads = get_source_place_payloads(resolve_missing_coordinates=False)

		self.assertEqual(len(payloads), 1)
		self.assertIsNone(payloads[0]['latitude'])
		self.assertIsNone(payloads[0]['longitude'])
		self.assertIsNone(payloads[0]['locations'][0]['latitude'])
		self.assertIsNone(payloads[0]['locations'][0]['longitude'])
		mock_get_place_coordinates.assert_called_once_with(mock_load_source_records.return_value[0], resolve_missing=False)

	@patch('places.services.source_listings.load_source_records')
	def test_mobile_business_membership_overrides_map_coordinates(self, mock_load_source_records):
		mock_load_source_records.return_value = []
		user = User.objects.create_user(username='mobile_owner', email='mobile-owner@example.com', password='test-pass-123')
		snapshot = ListingSnapshot.objects.create(
			name='Scoops Truck',
			listing_slug='scoops-truck',
			city=City.VENTURA,
			venue_type=VenueType.MOBILE,
			address_line_1='Approximate live location',
			tracked_location_latitude=34.2789,
			tracked_location_longitude=-119.2914,
		)
		claim = BusinessClaim.objects.create(
			claimant=user,
			listing_snapshot=snapshot,
			contact_name='Mobile Owner',
			work_email='owner@scoops.example.com',
			verification_summary='I operate this truck.',
			status=BusinessClaim.Status.APPROVED,
		)
		BusinessMembership.objects.create(user=user, claim=claim, is_active=True)

		payloads = get_source_place_payloads(resolve_missing_coordinates=False)

		self.assertEqual(len(payloads), 1)
		self.assertEqual(payloads[0]['slug'], 'scoops-truck')
		self.assertEqual(payloads[0]['venue_type'], VenueType.MOBILE)
		self.assertEqual(payloads[0]['venue_type_label'], 'Serves Multiple Locations / Service Area Business')
		self.assertEqual(payloads[0]['latitude'], 34.2789)
		self.assertEqual(payloads[0]['longitude'], -119.2914)
		self.assertEqual(payloads[0]['locations'][0]['address_line_1'], 'Approximate live location')
		self.assertTrue(payloads[0]['is_verified'])

	@patch('places.services.source_listings.load_source_records')
	def test_approved_manual_business_creation_profile_counts_as_place_without_membership(self, mock_load_source_records):
		mock_load_source_records.return_value = []
		user = User.objects.create_user(username='manual_place_owner', email='manual-place-owner@example.com', password='test-pass-123')
		snapshot = ListingSnapshot.objects.create(
			name='Approved Manual Place',
			listing_slug='approved-manual-place',
			city=City.CAMARILLO,
			venue_type=VenueType.CAFE,
			address_line_1='789 Ventura Blvd',
			state='CA',
			postal_code='93010',
			website_url='https://example.com/approved-manual-place',
			source_name=BusinessClaim.MANUAL_SOURCE_NAME,
		)
		BusinessClaim.objects.create(
			claimant=user,
			listing_snapshot=snapshot,
			pathway=BusinessClaim.Pathway.ESTABLISHED,
			status=BusinessClaim.Status.APPROVED,
			contact_name='Approved Owner',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='approved-manual@example.com',
			work_phone='805-555-0199',
			verification_summary='Approved manual business.',
		)

		payloads = get_source_place_payloads(resolve_missing_coordinates=False)

		self.assertEqual(len(payloads), 1)
		self.assertEqual(payloads[0]['slug'], 'approved-manual-place')
		self.assertEqual(payloads[0]['name'], 'Approved Manual Place')
		self.assertEqual(payloads[0]['venue_type'], VenueType.CAFE)
		self.assertEqual(payloads[0]['venue_type_label'], 'Cafe')
		self.assertTrue(payloads[0]['is_verified'])
		self.assertEqual(payloads[0]['locations'][0]['city'], City.CAMARILLO)

	@override_settings(HERE_API_KEY='', TOMTOM_API_KEY='')
	def test_hybrid_importer_adds_osm_places_without_duplicating_curated_sources(self):
		class StaticImporter:
			def __init__(self, records, source_name='static'):
				self.records = records
				self.source_name = source_name

			def load_records(self):
				return list(self.records)

		website_records = [
			ImportedPlace(
				name='Lure Fish House',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='60 S California St',
				source_name='business_websites',
				source_url='https://example.com/lure-ventura',
			),
		]
		osm_records = [
			ImportedPlace(
				name='Lure Fish House',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='60 S California Street',
				latitude=34.2801,
				longitude=-119.2929,
				source_name='openstreetmap_places',
				source_url='https://www.openstreetmap.org/node/1',
			),
			ImportedPlace(
				name='Aloha Steakhouse',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='364 S California St',
				latitude=34.2763384,
				longitude=-119.2929831,
				source_name='openstreetmap_places',
				source_url='https://www.openstreetmap.org/node/369154702',
			),
		]

		importer = HybridPlacesImporter(
			website_importer=StaticImporter(website_records, 'business_websites'),
			osm_importer=StaticImporter(osm_records, 'openstreetmap_places'),
		)

		records = importer.load_records()

		self.assertEqual(len(records), 2)
		self.assertEqual([record.name for record in records], ['Lure Fish House', 'Aloha Steakhouse'])

	@override_settings(OSM_PLACE_EXCLUDED_BUSINESSES=(('ventura', 'Barrelhouse 101'),))
	def test_osm_importer_skips_configured_excluded_businesses(self):
		importer = OpenStreetMapPlacesImporter()
		record = importer._build_place_record(
			City.VENTURA,
			{
				'type': 'way',
				'id': 410595933,
				'center': {'lat': 34.2785079, 'lon': -119.2923931},
				'tags': {
					'name': 'Barrelhouse 101',
					'amenity': 'restaurant',
					'addr:housenumber': '545',
					'addr:street': 'East Thompson Boulevard',
				},
			},
		)

		self.assertIsNone(record)

	@override_settings(OSM_PLACE_EXCLUDED_EXTERNAL_IDS=('osm:way:410595933',))
	def test_osm_importer_skips_configured_excluded_external_ids(self):
		importer = OpenStreetMapPlacesImporter()
		record = importer._build_place_record(
			City.VENTURA,
			{
				'type': 'way',
				'id': 410595933,
				'center': {'lat': 34.2785079, 'lon': -119.2923931},
				'tags': {
					'name': 'Some Business',
					'amenity': 'restaurant',
					'addr:housenumber': '545',
					'addr:street': 'East Thompson Boulevard',
					'website': 'https://example.com',
				},
			},
		)

		self.assertIsNone(record)

	def test_osm_importer_skips_disused_businesses(self):
		importer = OpenStreetMapPlacesImporter()
		record = importer._build_place_record(
			City.VENTURA,
			{
				'type': 'node',
				'id': 42,
				'lat': 34.27,
				'lon': -119.29,
				'tags': {
					'name': 'Closed Cafe',
					'amenity': 'cafe',
					'disused:amenity': 'cafe',
				},
			},
		)

		self.assertIsNone(record)

	@override_settings(OSM_PLACE_MIN_METADATA_SCORE=2)
	def test_osm_importer_skips_weak_metadata_records(self):
		importer = OpenStreetMapPlacesImporter()
		record = importer._build_place_record(
			City.VENTURA,
			{
				'type': 'node',
				'id': 99,
				'lat': 34.27,
				'lon': -119.29,
				'tags': {
					'name': 'Sparse Listing',
					'amenity': 'restaurant',
				},
			},
		)

		self.assertIsNone(record)

	@override_settings(HERE_API_KEY='here-token', TOMTOM_API_KEY='tomtom-token', HERE_MONTHLY_LIMIT=10, HERE_MONTHLY_RESERVE=1, TOMTOM_DAILY_LIMIT=10, TOMTOM_DAILY_RESERVE=1)
	def test_hybrid_importer_prefers_here_then_tomtom_before_osm_duplicates(self):
		class StaticImporter:
			def __init__(self, records, source_name):
				self.records = records
				self.source_name = source_name

			def load_records(self):
				return list(self.records)

		website_records = []
		here_records = [
			ImportedPlace(
				name='Aloha Steakhouse',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='364 S California St',
				latitude=34.2763384,
				longitude=-119.2929831,
				source_name='here_places',
				source_url='https://discover.search.hereapi.com/v1/discover',
			),
		]
		tomtom_records = [
			ImportedPlace(
				name='Aloha Steakhouse',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='364 S California St',
				latitude=34.2763384,
				longitude=-119.2929831,
				source_name='tomtom_places',
				source_url='https://api.tomtom.com/search/2/categorySearch/restaurant.json',
			),
		]
		osm_records = [
			ImportedPlace(
				name='Aloha Steakhouse',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='364 S California Street',
				latitude=34.2763384,
				longitude=-119.2929831,
				source_name='openstreetmap_places',
				source_url='https://www.openstreetmap.org/node/369154702',
			),
		]

		importer = HybridPlacesImporter(
			website_importer=StaticImporter(website_records, 'business_websites'),
			here_importer=StaticImporter(here_records, 'here_places'),
			tomtom_importer=StaticImporter(tomtom_records, 'tomtom_places'),
			osm_importer=StaticImporter(osm_records, 'openstreetmap_places'),
		)

		records = importer.load_records()

		self.assertEqual(len(records), 1)
		self.assertEqual(records[0].source_name, 'here_places')

	@override_settings(HERE_API_KEY='here-token', TOMTOM_API_KEY='tomtom-token', HERE_MONTHLY_LIMIT=10, HERE_MONTHLY_RESERVE=2, TOMTOM_DAILY_LIMIT=10, TOMTOM_DAILY_RESERVE=1)
	def test_hybrid_importer_falls_back_to_tomtom_when_here_budget_is_exhausted(self):
		class StaticImporter:
			def __init__(self, records, source_name):
				self.records = records
				self.source_name = source_name

			def load_records(self):
				return list(self.records)

		ProviderUsageWindow.objects.create(
			provider_name='here_places',
			window_kind=ProviderUsageWindow.WindowKind.MONTH,
			window_start=timezone.localdate().replace(day=1),
			consumed_transactions=8,
			transaction_limit=10,
			reserve_threshold=2,
		)

		importer = HybridPlacesImporter(
			website_importer=StaticImporter([], 'business_websites'),
			here_importer=StaticImporter([], 'here_places'),
			tomtom_importer=StaticImporter([
				ImportedPlace(
					name='TomTom Backup Spot',
					city=City.VENTURA,
					venue_type=VenueType.RESTAURANT,
					address_line_1='123 Main St',
					source_name='tomtom_places',
					source_url='https://api.tomtom.com/search/2/categorySearch/restaurant.json',
				),
			], 'tomtom_places'),
			osm_importer=StaticImporter([], 'openstreetmap_places'),
		)

		records = importer.load_records()

		self.assertEqual(len(records), 1)
		self.assertEqual(records[0].source_name, 'tomtom_places')

	@override_settings(HERE_API_KEY='here-token', TOMTOM_API_KEY='tomtom-token', HERE_MONTHLY_LIMIT=10, HERE_MONTHLY_RESERVE=1, TOMTOM_DAILY_LIMIT=10, TOMTOM_DAILY_RESERVE=1)
	def test_hybrid_importer_enriches_discovery_records_through_website_importer(self):
		class WebsiteImporter:
			source_name = 'business_websites'

			def load_records(self):
				return []

			def enrich_place_records(self, records):
				return [
					ImportedPlace(
						name=record.name,
						profile_name=record.profile_name,
						profile_slug=record.profile_slug,
						city=record.city,
						venue_type=record.venue_type,
						address_line_1=record.address_line_1,
						address_line_2=record.address_line_2,
						neighborhood=record.neighborhood,
						state=record.state,
						postal_code=record.postal_code,
						latitude=record.latitude,
						longitude=record.longitude,
						geocode_query=record.geocode_query,
						phone_number=record.phone_number,
						website_url=record.website_url,
						image_urls=list(record.image_urls),
						operating_hours=list(record.operating_hours),
						is_active=record.is_active,
						external_id=record.external_id,
						source_name=record.source_name,
						source_url=record.source_url,
						deals=[ImportedDeal(title='Happy Hour', deal_type=DealType.HAPPY_HOUR)],
					)
					for record in records
				]

		class StaticImporter:
			def __init__(self, records, source_name):
				self.records = records
				self.source_name = source_name

			def load_records(self):
				return list(self.records)

		importer = HybridPlacesImporter(
			website_importer=WebsiteImporter(),
			here_importer=StaticImporter([
				ImportedPlace(
					name='Discovery Bistro',
					city=City.VENTURA,
					venue_type=VenueType.RESTAURANT,
					address_line_1='123 Main St',
					website_url='https://example.com/discovery-bistro',
					source_name='here_places',
				)
			], 'here_places'),
			tomtom_importer=StaticImporter([], 'tomtom_places'),
			osm_importer=StaticImporter([], 'openstreetmap_places'),
		)

		records = importer.load_records()

		self.assertEqual(len(records), 1)
		self.assertEqual(len(records[0].deals), 1)
		self.assertEqual(records[0].deals[0].title, 'Happy Hour')


class HerePlacesImporterTests(TestCase):
	@override_settings(HERE_API_KEY='test-token', HERE_CACHE_TIMEOUT=0)
	def test_here_importer_builds_places_from_discover_results(self):
		class StubSession:
			def get(self, url, params=None, headers=None, timeout=None):
				class Response:
					def raise_for_status(self_inner):
						return None

					def json(self_inner):
						return {
							'items': [
								{
									'id': 'here-1',
									'title': 'Open Here Spot',
									'position': {'lat': 34.28, 'lng': -119.29},
									'address': {'street': '123 Main St', 'postalCode': '93001', 'stateCode': 'CA'},
									'contacts': [{'phone': [{'value': '(805) 555-0101'}], 'www': [{'value': 'https://example.com'}]}],
								},
							],
						}

				return Response()

		importer = HerePlacesImporter(session=StubSession())
		records = importer.load_records()

		self.assertEqual(len(records), 1)
		self.assertEqual(records[0].source_name, 'here_places')

	@override_settings(HERE_API_KEY='test-token', HERE_CACHE_TIMEOUT=0)
	def test_here_importer_filters_non_food_and_closed_results(self):
		importer = HerePlacesImporter()
		items = [
			{
				'id': 'here-food-1',
				'title': 'Harbor Tacos',
				'position': {'lat': 34.28, 'lng': -119.29},
				'address': {'street': '123 Main St', 'postalCode': '93001', 'stateCode': 'CA'},
				'categories': [{'name': 'Restaurant', 'primary': True}],
			},
			{
				'id': 'here-junk-1',
				'title': 'Point Mugu Fitness Center',
				'position': {'lat': 34.20, 'lng': -119.17},
				'address': {'street': '1 Base Rd', 'postalCode': '93042', 'stateCode': 'CA'},
				'categories': [{'name': 'Fitness/Health Club', 'primary': True}],
			},
			{
				'id': 'here-junk-2',
				'title': 'Mugu Lanes',
				'position': {'lat': 34.12, 'lng': -119.10},
				'address': {
					'street': 'Mugu Lanes, Point Mugu Naws',
					'label': 'Mugu Lanes, Point Mugu Naws, CA 93042, United States',
					'postalCode': '93042',
					'stateCode': 'CA',
				},
				'categories': [{'name': 'Bar', 'primary': True}],
			},
			{
				'id': 'here-junk-3',
				'title': 'In Between 5 and Club House',
				'position': {'lat': 34.23, 'lng': -119.02},
				'address': {
					'street': 'In Between 5 and Club House',
					'label': 'In Between 5 and Club House, Camarillo, CA 93012, United States',
					'postalCode': '93012',
					'stateCode': 'CA',
				},
				'categories': [{'name': 'Bar', 'primary': True}],
			},
			{
				'id': 'here-closed-1',
				'title': 'Closed Burger Spot',
				'position': {'lat': 34.30, 'lng': -119.30},
				'address': {'street': '999 Shoreline Dr', 'postalCode': '93001', 'stateCode': 'CA'},
				'categories': [{'name': 'Restaurant', 'primary': True}],
				'businessStatus': 'permanently closed',
			},
			{
				'id': 'here-label-1',
				'title': 'Camarillo, CA, United States',
				'position': {'lat': 34.21, 'lng': -119.03},
				'address': {'label': 'Camarillo, CA, United States', 'street': '', 'postalCode': '93010', 'stateCode': 'CA'},
				'categories': [{'name': 'Restaurant', 'primary': True}],
			},
			{
				'id': 'here-supplier-1',
				'title': 'Bimbo Bakeries USA',
				'position': {'lat': 34.22, 'lng': -119.04},
				'address': {'street': '456 Industry Way', 'postalCode': '93010', 'stateCode': 'CA'},
				'categories': [{'name': 'Bakery', 'primary': True}],
			},
		]

		kept_names = [item['title'] for item in items if importer._should_keep_item(item, search_term='bar')]

		self.assertEqual(kept_names, ['Harbor Tacos'])

	@override_settings(
		HERE_API_KEY='test-token',
		HERE_CACHE_TIMEOUT=0,
		HERE_PLACE_EXCLUDED_BUSINESSES=((City.CAMARILLO, 'Institution Ale Company'),),
	)
	def test_here_importer_skips_configured_excluded_businesses(self):
		class StubSession:
			def get(self, url, params=None, headers=None, timeout=None):
				class Response:
					def raise_for_status(self_inner):
						return None

					def json(self_inner):
						return {
							'items': [
								{
									'id': 'here-inst-1',
									'title': 'Institution Ale Company',
									'position': {'lat': 34.2164, 'lng': -119.0376},
									'address': {
										'street': '3841 Mission Oaks Blvd',
										'postalCode': '93012',
										'stateCode': 'CA',
										'city': 'camarillo',
										'label': '3841 Mission Oaks Blvd, Camarillo, CA 93012, United States',
									},
									'categories': [{'name': 'Brewery', 'primary': True}],
								},
								{
									'id': 'here-ok-1',
									'title': 'Harbor Tacos',
									'position': {'lat': 34.28, 'lng': -119.29},
									'address': {
										'street': '123 Main St',
										'postalCode': '93001',
										'stateCode': 'CA',
										'city': 'ventura',
									},
									'categories': [{'name': 'Restaurant', 'primary': True}],
								},
							],
						}

				return Response()

		importer = HerePlacesImporter(session=StubSession())
		records = importer.load_records()

		self.assertEqual([record.name for record in records], ['Harbor Tacos'])

	@override_settings(HERE_API_KEY='test-token', HERE_CACHE_TIMEOUT=0)
	def test_here_importer_skips_file_backed_excluded_external_ids(self):
		with TemporaryDirectory() as temp_dir:
			exclusions_path = Path(temp_dir) / 'discovery_exclusions.json'
			exclusions_path.write_text(
				'{"here_places": {"excluded_businesses": [], "excluded_external_ids": ["here:here-bad-1"]}}',
				encoding='utf-8',
			)

			class StubSession:
				def get(self, url, params=None, headers=None, timeout=None):
					class Response:
						def raise_for_status(self_inner):
							return None

						def json(self_inner):
							return {
								'items': [
									{
										'id': 'here-bad-1',
										'title': 'Bubble Bakery',
										'position': {'lat': 34.20, 'lng': -119.00},
										'address': {'street': '1 Main St', 'postalCode': '93010', 'stateCode': 'CA', 'city': 'camarillo'},
										'categories': [{'name': 'Bakery', 'primary': True}],
									},
									{
										'id': 'here-good-1',
										'title': 'Harbor Tacos',
										'position': {'lat': 34.28, 'lng': -119.29},
										'address': {'street': '123 Main St', 'postalCode': '93001', 'stateCode': 'CA', 'city': 'ventura'},
										'categories': [{'name': 'Restaurant', 'primary': True}],
									},
								],
							}

					return Response()

			with self.settings(DISCOVERY_EXCLUSIONS_PATH=exclusions_path):
				importer = HerePlacesImporter(session=StubSession())
				records = importer.load_records()

		self.assertEqual([record.name for record in records], ['Harbor Tacos'])


class TomTomPlacesImporterTests(TestCase):
	@override_settings(TOMTOM_API_KEY='test-token')
	def test_tomtom_importer_builds_places_from_category_search_results(self):
		class StubSession:
			def get(self, url, params=None, headers=None, timeout=None):
				class Response:
					def raise_for_status(self_inner):
						return None

					def json(self_inner):
						return {
							'results': [
								{
									'id': 'tt-1',
									'poi': {'name': 'Open TomTom Spot', 'phone': '(805) 555-0102', 'url': 'https://example.org'},
									'position': {'lat': 34.29, 'lon': -119.28},
									'address': {'streetNumber': '456', 'streetName': 'Oak St', 'postalCode': '93001', 'countrySubdivision': 'CA'},
								},
							],
						}

				return Response()

		importer = TomTomPlacesImporter(session=StubSession())
		records = importer.load_records()

		self.assertEqual(len(records), 1)
		self.assertEqual(records[0].source_name, 'tomtom_places')


class ProviderQuotaTests(TestCase):
	@override_settings(HERE_API_KEY='here-token', TOMTOM_API_KEY='tomtom-token', HERE_MONTHLY_LIMIT=10, HERE_MONTHLY_RESERVE=2, TOMTOM_DAILY_LIMIT=5, TOMTOM_DAILY_RESERVE=1)
	def test_provider_selection_prefers_here_until_monthly_reserve_then_switches(self):
		self.assertEqual(select_discovery_provider(), 'here_places')

		ProviderUsageWindow.objects.update_or_create(
			provider_name='here_places',
			window_kind=ProviderUsageWindow.WindowKind.MONTH,
			window_start=timezone.localdate().replace(day=1),
			defaults={
				'consumed_transactions': 8,
				'transaction_limit': 10,
				'reserve_threshold': 2,
			},
		)

		self.assertEqual(select_discovery_provider(), 'tomtom_places')

		ProviderUsageWindow.objects.update_or_create(
			provider_name='tomtom_places',
			window_kind=ProviderUsageWindow.WindowKind.DAY,
			window_start=timezone.localdate(),
			defaults={
				'consumed_transactions': 4,
				'transaction_limit': 5,
				'reserve_threshold': 1,
			},
		)

		self.assertEqual(select_discovery_provider(), 'openstreetmap_places')

	@override_settings(HERE_API_KEY='here-token', HERE_MONTHLY_LIMIT=3, HERE_MONTHLY_RESERVE=1)
	def test_consume_provider_transaction_stops_at_reserve_cutoff(self):
		self.assertTrue(consume_provider_transaction('here_places'))
		self.assertTrue(consume_provider_transaction('here_places'))
		self.assertFalse(consume_provider_transaction('here_places'))

		statuses = get_provider_usage_statuses()
		here_status = next(status for status in statuses if status['provider_name'] == 'here_places')
		self.assertEqual(here_status['consumed_transactions'], 2)
		self.assertEqual(here_status['remaining_transactions'], 1)
		self.assertEqual(here_status['remaining_before_reserve'], 0)
		self.assertFalse(here_status['available'])


class YelpFusionPlacesImporterTests(TestCase):
	@override_settings(YELP_FUSION_API_KEY='test-token')
	def test_yelp_importer_skips_closed_businesses(self):
		class StubSession:
			def __init__(self):
				self.calls = []

			def get(self, url, params=None, headers=None, timeout=None):
				self.calls.append({'url': url, 'params': params, 'headers': headers, 'timeout': timeout})

				class Response:
					def raise_for_status(self_inner):
						return None

					def json(self_inner):
						return {
							'businesses': [
								{
									'id': 'closed-one',
									'name': 'Closed Spot',
									'is_closed': True,
									'location': {'address1': '123 Main St', 'state': 'CA', 'zip_code': '93001'},
									'coordinates': {'latitude': 34.27, 'longitude': -119.29},
								},
								{
									'id': 'open-one',
									'name': 'Open Spot',
									'is_closed': False,
									'location': {'address1': '456 Main St', 'state': 'CA', 'zip_code': '93001'},
									'coordinates': {'latitude': 34.28, 'longitude': -119.28},
									'url': 'https://www.yelp.com/biz/open-one',
								},
							],
						}

				return Response()

		importer = YelpFusionPlacesImporter(session=StubSession())
		records = importer.load_records()

		self.assertEqual(len(records), 1)
		self.assertEqual(records[0].name, 'Open Spot')
		self.assertEqual(records[0].source_name, 'yelp_fusion_places')


@override_settings(
	CACHES={
		'default': {
			'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
			'LOCATION': 'test-source-fetch-cache',
		},
		'source_fetch': {
			'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
			'LOCATION': 'test-source-fetch-cache-source-fetch',
		}
	},
	SOURCE_FETCH_CACHE_ALIAS='source_fetch',
	SOURCE_FETCH_CACHE_TIMEOUT=60,
)
class SourceFetchCacheTests(TestCase):
	def setUp(self):
		caches['default'].clear()
		caches['source_fetch'].clear()

	def tearDown(self):
		caches['default'].clear()
		caches['source_fetch'].clear()

	def test_fetch_html_reuses_cached_source_response(self):
		session = CountingSession('<html>live source payload</html>')
		first_importer = DummyImporter(session=session)
		second_importer = DummyImporter(session=session)

		first_response = first_importer.fetch_html()
		second_response = second_importer.fetch_html()

		self.assertEqual(first_response, '<html>live source payload</html>')
		self.assertEqual(second_response, '<html>live source payload</html>')
		self.assertEqual(len(session.calls), 1)


@override_settings(
	EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
	PROFILE_APP_LINK_URL='diningdealz://open',
)
class BusinessClaimTests(APITestCase):
	def setUp(self):
		self.user = User.objects.create_user(username='yardhouse_mgr', email='manager@example.com', password='test-pass-123')
		self.reviewer = User.objects.create_superuser(username='adminuser', email='admin@example.com', password='test-pass-123')
		self.snapshot = ListingSnapshot.objects.create(
			name='Yard House',
			city=City.OXNARD,
			venue_type=VenueType.RESTAURANT,
			address_line_1='501 Collection Blvd',
			source_name='example_html',
			source_url='https://example.com/yard-house',
		)

	def test_submitted_claim_can_be_approved_into_membership(self):
		claim = BusinessClaim.objects.create(
			claimant=self.user,
			listing_snapshot=self.snapshot,
			contact_name='Jane Manager',
			job_title=BusinessClaim.JobTitle.MANAGER,
			work_email='jane.manager@yardhouse.com',
			work_phone='805-555-0101',
			verification_documents={'business_registration': ['CA filing'], 'health_permit': ['County permit'], 'abc_license': [], 'proof_of_address_control': []},
			verification_summary='I manage the Yard House location and can verify store promotions.',
			status=BusinessClaim.Status.SUBMITTED,
		)
		BusinessClaimAttachment.objects.create(
			claim=claim,
			attachment_kind=BusinessClaimAttachment.AttachmentKind.PROOF_OF_AUTHORITY,
			file=SimpleUploadedFile('authority.pdf', b'authority', content_type='application/pdf'),
			original_filename='authority.pdf',
			content_type='application/pdf',
			file_size=9,
		)

		membership = claim.approve(reviewed_by=self.reviewer, reviewer_notes='Verified through manual review.')

		claim.refresh_from_db()
		self.assertEqual(claim.status, BusinessClaim.Status.APPROVED)
		self.assertEqual(claim.reviewed_by, self.reviewer)
		self.assertGreaterEqual(claim.verification_score, 60)
		self.assertEqual(BusinessMembership.objects.count(), 1)
		self.assertEqual(membership.user, self.user)
		self.assertEqual(membership.claim, claim)
		self.assertTrue(membership.is_active)
		self.assertEqual(len(mail.outbox), 1)
		self.assertIn('approved', mail.outbox[0].subject.lower())
		self.assertIn('diningdealz://open', mail.outbox[0].body)

	def test_draft_claim_cannot_be_approved(self):
		claim = BusinessClaim.objects.create(
			claimant=self.user,
			listing_snapshot=self.snapshot,
			contact_name='Jane Manager',
			job_title=BusinessClaim.JobTitle.MANAGER,
			work_email='jane.manager@yardhouse.com',
			verification_summary='I manage the location.',
		)

		with self.assertRaises(ValidationError):
			claim.approve(reviewed_by=self.reviewer)

	def test_reject_requires_reviewer_notes_and_emails_rejection_summary(self):
		claim = BusinessClaim.objects.create(
			claimant=self.user,
			listing_snapshot=self.snapshot,
			pathway=BusinessClaim.Pathway.ESTABLISHED,
			contact_name='Jane Manager',
			job_title=BusinessClaim.JobTitle.MANAGER,
			work_email='jane.manager@yardhouse.com',
			work_phone='805-555-0101',
			employer_address='501 Collection Blvd',
			verification_documents={'business_registration': ['CA filing'], 'health_permit': ['County permit'], 'abc_license': [], 'proof_of_address_control': []},
			verification_summary='I manage the Yard House location and can verify store promotions.',
			supporting_details='Manager submitted payroll records.',
			status=BusinessClaim.Status.SUBMITTED,
		)
		BusinessClaimAttachment.objects.create(
			claim=claim,
			attachment_kind=BusinessClaimAttachment.AttachmentKind.PROOF_OF_AUTHORITY,
			file=SimpleUploadedFile('authority.pdf', b'authority', content_type='application/pdf'),
			original_filename='authority.pdf',
			content_type='application/pdf',
			file_size=9,
		)

		with self.assertRaises(ValidationError):
			claim.reject(reviewed_by=self.reviewer)

		claim.rejection_reason_codes = [
			BusinessClaim.RejectionReason.PROOF_OF_AUTHORITY_INVALID,
			BusinessClaim.RejectionReason.PHOTOS_UNCLEAR,
		]
		claim.reject(reviewed_by=self.reviewer, reviewer_notes='Rejected because the submitted authority document does not match the listed manager name.')

		claim.refresh_from_db()
		self.assertEqual(claim.status, BusinessClaim.Status.REJECTED)
		self.assertEqual(len(mail.outbox), 1)
		self.assertIn('rejected', mail.outbox[0].subject.lower())
		self.assertIn('Proof of authority does not verify the claimant relationship', mail.outbox[0].body)
		self.assertIn('better images or clearer photo references', mail.outbox[0].body)
		self.assertIn('go through the registration process again', mail.outbox[0].body)
		self.assertIn('authority.pdf', mail.outbox[0].body)
		self.assertIn('CA filing', mail.outbox[0].body)
		self.assertIn('does not match the listed manager name', mail.outbox[0].body)

	def test_submitted_claim_requires_proof_of_authority_for_approval(self):
		claim = BusinessClaim.objects.create(
			claimant=self.user,
			listing_snapshot=self.snapshot,
			contact_name='Jane Manager',
			job_title=BusinessClaim.JobTitle.MANAGER,
			work_email='jane.manager@yardhouse.com',
			work_phone='805-555-0101',
			verification_documents={'business_registration': ['CA filing'], 'health_permit': ['County permit'], 'abc_license': [], 'proof_of_address_control': []},
			verification_summary='I manage the location.',
			status=BusinessClaim.Status.SUBMITTED,
		)

		with self.assertRaises(ValidationError):
			claim.approve(reviewed_by=self.reviewer)

	def test_duplicate_reused_documents_reduce_score_and_block_approval(self):
		claim = BusinessClaim.objects.create(
			claimant=self.user,
			listing_snapshot=self.snapshot,
			pathway=BusinessClaim.Pathway.ESTABLISHED,
			contact_name='Jane Manager',
			job_title=BusinessClaim.JobTitle.MANAGER,
			work_email='jane.manager@gmail.com',
			work_phone='805-555-0101',
			employer_address='501 Collection Blvd',
			verification_summary='I manage the Yard House location and can verify store promotions.',
			status=BusinessClaim.Status.SUBMITTED,
		)
		reused_bytes = b'resume transcript baseball highlights and school awards'
		for attachment_kind in [
			BusinessClaimAttachment.AttachmentKind.BUSINESS_REGISTRATION,
			BusinessClaimAttachment.AttachmentKind.HEALTH_PERMIT,
			BusinessClaimAttachment.AttachmentKind.PROOF_OF_AUTHORITY,
		]:
			BusinessClaimAttachment.objects.create(
				claim=claim,
				attachment_kind=attachment_kind,
				file=SimpleUploadedFile('resume.pdf', reused_bytes, content_type='application/pdf'),
				original_filename='resume.pdf',
				content_type='application/pdf',
				file_size=len(reused_bytes),
			)

		verdict = claim.evaluate_verification()

		self.assertLess(verdict['score'], 40)
		self.assertIn('reused_same_file_across_required_document_slots', verdict['flags'])
		self.assertIn('business_registration_document_content_mismatch', verdict['flags'])
		self.assertIn('proof_of_authority_document_content_mismatch', verdict['flags'])
		self.assertIn('reused_same_file_across_required_document_slots', verdict['blockers'])

		with self.assertRaises(ValidationError):
			claim.approve(reviewed_by=self.reviewer)

	@patch('places.models._extract_text_from_image_bytes', return_value='manager authorization payroll record')
	def test_image_ocr_text_can_support_document_scoring(self, mock_extract_text_from_image_bytes):
		claim = BusinessClaim.objects.create(
			claimant=self.user,
			listing_snapshot=self.snapshot,
			pathway=BusinessClaim.Pathway.ESTABLISHED,
			contact_name='Jane Manager',
			job_title=BusinessClaim.JobTitle.MANAGER,
			work_email='jane.manager@yardhouse.com',
			work_phone='805-555-0101',
			employer_address='501 Collection Blvd',
			verification_documents={'business_registration': ['CA filing'], 'health_permit': ['County permit'], 'abc_license': [], 'proof_of_address_control': []},
			verification_summary='I manage the Yard House location and can verify store promotions.',
			status=BusinessClaim.Status.SUBMITTED,
		)
		BusinessClaimAttachment.objects.create(
			claim=claim,
			attachment_kind=BusinessClaimAttachment.AttachmentKind.PROOF_OF_AUTHORITY,
			file=SimpleUploadedFile('scan.png', b'fake-image-bytes', content_type='image/png'),
			original_filename='scan.png',
			content_type='image/png',
			file_size=16,
		)

		verdict = claim.evaluate_verification()

		self.assertGreaterEqual(verdict['score'], 65)
		self.assertNotIn('proof_of_authority_document_low_confidence', verdict['flags'])
		mock_extract_text_from_image_bytes.assert_called()


class ProfileSignupApiTests(APITestCase):
	@override_settings(
		EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
		PROFILE_EMAIL_VERIFICATION_URL_BASE='http://testserver/api/profiles/verify-email',
	)
	def test_customer_signup_creates_customer_account(self):
		response = self.client.post(
			reverse('customer-signup'),
			{
				'username': 'ventura_fan',
				'email': 'fan@example.com',
				'password': 'test-pass-123',
				'first_name': 'Ventura',
				'last_name': 'Fan',
			},
			format='json',
		)

		self.assertEqual(response.status_code, 201)
		self.assertEqual(response.data['profile_type'], 'customer')
		self.assertEqual(response.data['auth_token'], '')
		self.assertTrue(response.data['email_verification_required'])
		self.assertFalse(response.data['can_access_places'])
		self.assertIsNotNone(response.data['verification_code_expires_at'])
		self.assertFalse(response.data['email_verified'])
		user = User.objects.get(username='ventura_fan')
		profile = AccountProfile.objects.get(user=user)
		self.assertEqual(user.email, 'fan@example.com')
		self.assertTrue(user.check_password('test-pass-123'))
		self.assertIsNotNone(profile.email_verification_sent_at)
		self.assertTrue(profile.email_verification_code)
		self.assertEqual(len(mail.outbox), 1)
		self.assertIn('DiningDealz', mail.outbox[0].subject)
		self.assertIn('DiningDealz', mail.outbox[0].from_email)
		self.assertIn(profile.email_verification_code, mail.outbox[0].body)
		self.assertIn('/api/profiles/verify-email/', mail.outbox[0].body)

	@patch('places.views.get_source_place_payload')
	def test_business_signup_creates_submitted_claim(self, mock_get_source_place_payload):
		mock_get_source_place_payload.return_value = {
			'id': 402,
			'name': 'Finney\'s Crafthouse',
			'slug': 'finneys-crafthouse',
			'city': City.VENTURA,
			'venue_type': VenueType.RESTAURANT,
			'address_line_1': '494 E Main St',
			'address_line_2': '',
			'neighborhood': 'Downtown',
			'state': 'CA',
			'postal_code': '93001',
			'phone_number': '805-555-0199',
			'website_url': 'https://example.com/finneys',
			'locations': [
				{
					'id': 1,
					'slug': 'finneys-crafthouse-ventura',
					'name': 'Finney\'s Crafthouse',
					'city': City.VENTURA,
					'venue_type': VenueType.RESTAURANT,
					'address_line_1': '494 E Main St',
					'address_line_2': '',
					'neighborhood': 'Downtown',
					'state': 'CA',
					'postal_code': '93001',
					'phone_number': '805-555-0199',
					'website_url': 'https://example.com/finneys',
				}
			],
		}

		response = self.client.post(
			reverse('business-signup'),
			{
				'username': 'finneys_owner',
				'email': 'owner@example.com',
				'password': 'test-pass-123',
				'first_name': 'Pat',
				'last_name': 'Owner',
				'business_slug': 'finneys-crafthouse',
				'contact_name': 'Pat Owner',
				'job_title': BusinessClaim.JobTitle.MANAGER,
				'work_email': 'pat@finneys.com',
				'work_phone': '805-555-0100',
				'employer_address': '494 E Main St, Ventura, CA 93001',
				'address_not_applicable': False,
				'business_website_url': 'https://finneysventura.example.com',
				'social_profiles': json.dumps({
					'website': {
						'url': 'https://finneysventura.example.com',
						'username': 'finneysventura.example.com',
					},
					'instagram': {
						'url': 'https://instagram.com/finneysventura',
						'username': 'finneysventura',
					},
				}),
				'verification_documents': json.dumps({
					'business_registration': ['CA business license #123'],
					'health_permit': ['Ventura County permit #A-55'],
				}),
				'proof_of_authority_attachments': [SimpleUploadedFile('manager-proof.pdf', b'proof', content_type='application/pdf')],
				'supporting_details': 'Available to provide payroll and licensing records upon request.',
			},
			format='multipart',
		)

		self.assertEqual(response.status_code, 201)
		self.assertEqual(response.data['profile_type'], 'business')
		self.assertEqual(response.data['claim_status'], BusinessClaim.Status.SUBMITTED)
		self.assertEqual(response.data['auth_token'], '')
		self.assertTrue(response.data['email_verification_required'])
		claim = BusinessClaim.objects.select_related('claimant', 'listing_snapshot').get(claimant__username='finneys_owner')
		self.assertEqual(claim.work_email, 'pat@finneys.com')
		self.assertEqual(claim.listing_snapshot.listing_slug, 'finneys-crafthouse')
		self.assertEqual(claim.listing_snapshot.name, "Finney's Crafthouse")
		self.assertEqual(claim.employer_address, '494 E Main St, Ventura, CA 93001')
		self.assertEqual(claim.pathway, BusinessClaim.Pathway.CLAIMED)
		self.assertEqual(claim.business_website_url, 'https://finneysventura.example.com')
		self.assertEqual(
			claim.social_profiles,
			{
				'website': {
					'url': 'https://finneysventura.example.com',
					'username': 'finneysventura.example.com',
				},
				'instagram': {
					'url': 'https://instagram.com/finneysventura',
					'username': 'finneysventura',
				},
			},
		)
		self.assertGreaterEqual(claim.verification_score, 60)
		self.assertIn(BusinessClaimAttachment.AttachmentKind.PROOF_OF_AUTHORITY, list(claim.attachments.values_list('attachment_kind', flat=True)))
		self.assertEqual(
			claim.get_profile_entry_values(BusinessClaim.ProfileEntryKind.SOCIAL_MEDIA_LINK),
			['https://instagram.com/finneysventura'],
		)

	@patch('places.views.get_source_place_payload')
	def test_business_signup_stores_structured_deal_and_hour_overrides(self, mock_get_source_place_payload):
		mock_get_source_place_payload.return_value = {
			'id': 402,
			'name': 'Finney\'s Crafthouse',
			'slug': 'finneys-crafthouse',
			'city': City.VENTURA,
			'venue_type': VenueType.RESTAURANT,
			'address_line_1': '494 E Main St',
			'address_line_2': '',
			'neighborhood': 'Downtown',
			'state': 'CA',
			'postal_code': '93001',
			'phone_number': '805-555-0199',
			'website_url': 'https://example.com/finneys',
			'locations': [],
		}

		response = self.client.post(
			reverse('business-signup'),
			{
				'username': 'finneys_override_owner',
				'email': 'override-owner@example.com',
				'password': 'test-pass-123',
				'first_name': 'Pat',
				'last_name': 'Owner',
				'business_slug': 'finneys-crafthouse',
				'contact_name': 'Pat Owner',
				'job_title': BusinessClaim.JobTitle.MANAGER,
				'work_email': 'pat@finneys.com',
				'work_phone': '805-555-0100',
				'employer_address': '494 E Main St, Ventura, CA 93001',
				'verification_documents': json.dumps({
					'business_registration': ['CA business license #123'],
					'health_permit': ['Ventura County permit #A-55'],
				}),
				'deal_overrides': json.dumps([{
					'title': 'Owner Happy Hour',
					'description': '$2 off cocktails',
					'deal_type': DealType.HAPPY_HOUR,
					'price_text': '$2 Off',
					'terms': 'Dine-in only',
					'happy_hours': [{'weekday': Weekday.FRIDAY, 'start_time': '16:00', 'end_time': '19:00', 'all_day': False}],
				}]),
				'operating_hour_overrides': json.dumps([{'weekday': Weekday.FRIDAY, 'open_time': '10:00', 'close_time': '22:00'}]),
				'proof_of_authority_attachments': [SimpleUploadedFile('manager-proof.pdf', b'proof', content_type='application/pdf')],
				'supporting_details': 'Updated by owner.',
			},
			format='multipart',
		)

		self.assertEqual(response.status_code, 201)
		claim = BusinessClaim.objects.get(claimant__username='finneys_override_owner')
		self.assertEqual(claim.deal_overrides[0]['title'], 'Owner Happy Hour')
		self.assertEqual(claim.operating_hour_overrides[0]['weekday'], Weekday.FRIDAY)
		self.assertIn('Owner Happy Hour', claim.offer_entries[0])

	@patch('places.views.get_source_place_payload')
	def test_claimed_business_signup_accepts_long_offer_entries(self, mock_get_source_place_payload):
		mock_get_source_place_payload.return_value = {
			'id': 1,
			'slug': 'finneys-crafthouse',
			'name': 'Finney\'s Crafthouse',
			'city': City.VENTURA,
			'venue_type': VenueType.RESTAURANT,
			'address_line_1': '494 E Main St',
			'address_line_2': '',
			'neighborhood': 'Downtown',
			'state': 'CA',
			'postal_code': '93001',
			'phone_number': '805-555-0199',
			'website_url': 'https://example.com/finneys',
			'locations': [],
		}

		long_offer_entry = ' | '.join([
			'Late Night Feast',
			'$25 for two',
			'A long imported description ' + ('with extra detail ' * 25).strip(),
			'Terms: valid Sunday through Thursday after 9pm except holidays',
			'Happy hour: Sun-Thu 9:00 PM - 11:30 PM',
		])

		response = self.client.post(
			reverse('business-signup'),
			{
				'username': 'finneys_long_offer_owner',
				'email': 'long-offer@example.com',
				'password': 'test-pass-123',
				'first_name': 'Pat',
				'last_name': 'Owner',
				'business_slug': 'finneys-crafthouse',
				'contact_name': 'Pat Owner',
				'job_title': BusinessClaim.JobTitle.MANAGER,
				'work_email': 'pat@finneys.com',
				'work_phone': '805-555-0100',
				'employer_address': '494 E Main St, Ventura, CA 93001',
				'address_not_applicable': False,
				'offer_entries': json.dumps([long_offer_entry]),
				'verification_documents': json.dumps({
					'business_registration': ['CA business license #123'],
					'health_permit': ['Ventura County permit #A-55'],
					'abc_license': [],
					'proof_of_address_control': [],
				}),
				'proof_of_authority_attachments': [SimpleUploadedFile('manager-proof.pdf', b'proof', content_type='application/pdf')],
				'supporting_details': 'Imported deal copy should not block claim submission.',
			},
			format='multipart',
		)

		self.assertEqual(response.status_code, 201)
		claim = BusinessClaim.objects.get(claimant__username='finneys_long_offer_owner')
		self.assertEqual(claim.offer_entries, [long_offer_entry])

	@patch('places.views.get_source_place_payload')
	def test_claimed_business_signup_accepts_uploaded_business_photos(self, mock_get_source_place_payload):
		mock_get_source_place_payload.return_value = {
			'id': 1,
			'slug': 'finneys-crafthouse',
			'name': 'Finney\'s Crafthouse',
			'city': City.VENTURA,
			'venue_type': VenueType.RESTAURANT,
			'address_line_1': '494 E Main St',
			'address_line_2': '',
			'neighborhood': 'Downtown',
			'state': 'CA',
			'postal_code': '93001',
			'phone_number': '805-555-0199',
			'website_url': 'https://example.com/finneys',
			'locations': [],
		}

		with TemporaryDirectory() as temp_dir:
			with override_settings(MEDIA_ROOT=Path(temp_dir)):
				response = self.client.post(
					reverse('business-signup'),
					{
						'username': 'photo_claim_owner',
						'email': 'photo-claim@example.com',
						'password': 'test-pass-123',
						'first_name': 'Pat',
						'last_name': 'Owner',
						'business_slug': 'finneys-crafthouse',
						'contact_name': 'Pat Owner',
						'job_title': BusinessClaim.JobTitle.MANAGER,
						'work_email': 'pat@finneys.com',
						'work_phone': '805-555-0100',
						'employer_address': '494 E Main St, Ventura, CA 93001',
						'address_not_applicable': False,
						'verification_documents': json.dumps({
							'business_registration': ['CA business license #123'],
							'health_permit': ['Ventura County permit #A-55'],
							'abc_license': [],
							'proof_of_address_control': [],
						}),
						'proof_of_authority_attachments': [SimpleUploadedFile('manager-proof.pdf', b'proof', content_type='application/pdf')],
						'profile_photo_uploads': [
							SimpleUploadedFile('front.jpg', b'front-photo', content_type='image/jpeg'),
							SimpleUploadedFile('inside.png', b'inside-photo', content_type='image/png'),
						],
						'supporting_details': 'Available to provide payroll and licensing records upon request.',
					},
					format='multipart',
				)

		self.assertEqual(response.status_code, 201)
		claim = BusinessClaim.objects.get(claimant__username='photo_claim_owner')
		self.assertEqual(len(claim.photo_references), 2)
		self.assertTrue(claim.photo_gallery_overridden)
		self.assertTrue(all('/business-profile-photos/' in photo_url for photo_url in claim.photo_references))
		self.assertEqual(
			claim.get_profile_entry_values(BusinessClaim.ProfileEntryKind.PHOTO_REFERENCE),
			claim.photo_references,
		)

	@patch('places.views.get_source_place_payload')
	def test_claimed_business_signup_reuses_matching_existing_snapshot_even_when_slug_changes(self, mock_get_source_place_payload):
		legacy_snapshot = ListingSnapshot.objects.create(
			name='Yard House',
			city=City.OXNARD,
			venue_type=VenueType.BAR,
			address_line_1='501 Collection Blvd Ste # 4130',
			website_url='https://www.yardhouse.com/locations/ca/oxnard/oxnard-the-collection-at-riverpark/8349',
			source_name='business_websites',
			external_id='www-yardhouse-com-locations-ca-oxnard-oxnard-the-collection-at-riverpark-8349-8081baa57994',
			listing_slug='yard-house-oxnard',
		)
		mock_get_source_place_payload.return_value = {
			'id': 585,
			'name': 'Yard House',
			'slug': 'yard-house',
			'city': City.OXNARD,
			'venue_type': VenueType.BAR,
			'address_line_1': '501 Collection Blvd Ste # 4130',
			'address_line_2': '',
			'neighborhood': '',
			'state': 'CA',
			'postal_code': '93036',
			'phone_number': '805-555-0101',
			'website_url': 'https://www.yardhouse.com/locations/ca/oxnard/oxnard-the-collection-at-riverpark/8349',
			'locations': [],
		}

		response = self.client.post(
			reverse('business-signup'),
			{
				'username': 'yard_house_owner',
				'email': 'owner@yardhouse.example.com',
				'password': 'test-pass-123',
				'first_name': 'Yard',
				'last_name': 'Owner',
				'business_slug': 'yard-house',
				'contact_name': 'Yard Owner',
				'job_title': BusinessClaim.JobTitle.MANAGER,
				'work_email': 'manager@yardhouse.example.com',
				'work_phone': '805-555-0100',
				'employer_address': '501 Collection Blvd Ste # 4130',
				'address_not_applicable': False,
				'business_website_url': 'https://www.yardhouse.com/locations/ca/oxnard/oxnard-the-collection-at-riverpark/8349',
				'verification_documents': json.dumps({
					'business_registration': ['CA business license #123'],
					'health_permit': ['Ventura County permit #A-55'],
					'abc_license': ['ABC type 47'],
					'proof_of_address_control': [],
				}),
				'proof_of_authority_attachments': [SimpleUploadedFile('manager-proof.pdf', b'proof', content_type='application/pdf')],
				'supporting_details': 'Legacy imported snapshot should be reused.',
			},
			format='multipart',
		)

		self.assertEqual(response.status_code, 201)
		claim = BusinessClaim.objects.select_related('listing_snapshot').get(claimant__username='yard_house_owner')
		legacy_snapshot.refresh_from_db()
		self.assertEqual(claim.listing_snapshot_id, legacy_snapshot.id)
		self.assertEqual(legacy_snapshot.listing_slug, 'yard-house')
		self.assertEqual(ListingSnapshot.objects.filter(name='Yard House').count(), 1)

	def test_manual_business_signup_supports_address_not_applicable(self):
		response = self.client.post(
			reverse('manual-business-signup'),
			{
				'username': 'new_bistro_owner',
				'email': 'newbistro@example.com',
				'password': 'test-pass-123',
				'first_name': 'Casey',
				'last_name': 'Founder',
				'business_name': 'Corner Bistro',
				'business_city': BusinessClaim.MULTIPLE_AREAS_VALUE,
				'business_venue_type': VenueType.CAFE,
				'business_website_url': 'https://example.com/corner-bistro',
				'contact_name': 'Casey Founder',
				'job_title': BusinessClaim.JobTitle.OWNER,
				'work_email': 'owner@cornerbistro.com',
				'work_phone': '805-555-0133',
				'employer_address': '',
				'address_not_applicable': True,
				'verification_documents': json.dumps({
					'business_registration': ['Articles of organization filed with CA Secretary of State'],
					'health_permit': ['Ventura County temporary permit receipt'],
				}),
				'proof_of_authority_attachments': [SimpleUploadedFile('owner-proof.pdf', b'owner-proof', content_type='application/pdf')],
				'supporting_details': 'Happy to provide incorporation documents during review.',
			},
			format='multipart',
		)

		self.assertEqual(response.status_code, 201)
		self.assertEqual(response.data['auth_token'], '')
		self.assertTrue(response.data['email_verification_required'])
		claim = BusinessClaim.objects.select_related('listing_snapshot').get(claimant__username='new_bistro_owner')
		self.assertEqual(claim.status, BusinessClaim.Status.SUBMITTED)
		self.assertTrue(claim.address_not_applicable)
		self.assertTrue(claim.serves_multiple_areas)
		self.assertEqual(claim.listing_snapshot.source_name, BusinessClaim.MANUAL_SOURCE_NAME)
		self.assertEqual(claim.listing_snapshot.external_id, 'user-new-bistro-owner')
		self.assertEqual(claim.listing_snapshot.address_line_1, 'Approximate live location')

	@override_settings(
		EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
		PROFILE_EMAIL_VERIFICATION_URL_BASE='http://testserver/api/profiles/verify-email',
	)
	def test_verified_manual_business_claim_remains_pending_until_review(self):
		signup_response = self.client.post(
			reverse('manual-business-signup'),
			{
				'username': 'pending_bistro_owner',
				'email': 'pendingbistro@example.com',
				'password': 'test-pass-123',
				'first_name': 'Casey',
				'last_name': 'Founder',
				'business_name': 'Pending Bistro',
				'business_city': City.VENTURA,
				'business_venue_type': VenueType.CAFE,
				'business_website_url': 'https://example.com/pending-bistro',
				'contact_name': 'Casey Founder',
				'job_title': BusinessClaim.JobTitle.OWNER,
				'work_email': 'owner@pendingbistro.com',
				'work_phone': '805-555-0133',
				'employer_address': '123 Ventura Ave',
				'address_not_applicable': False,
				'verification_documents': json.dumps({
					'business_registration': ['Articles of organization'],
					'health_permit': ['Ventura County permit receipt'],
				}),
				'proof_of_authority_attachments': [SimpleUploadedFile('owner-proof.pdf', b'owner-proof', content_type='application/pdf')],
				'supporting_details': 'Ready for review.',
			},
			format='multipart',
		)

		self.assertEqual(signup_response.status_code, 201)
		profile = AccountProfile.objects.get(user__username='pending_bistro_owner')

		verify_response = self.client.post(
			reverse('profile-verify-email-code'),
			{
				'username': 'pending_bistro_owner',
				'portal': 'business',
				'code': profile.email_verification_code,
			},
			format='json',
		)

		self.assertEqual(verify_response.status_code, 200)
		self.assertEqual(verify_response.data['auth_token'], '')
		self.assertTrue(verify_response.data['claim_review_pending'])
		self.assertEqual(verify_response.data['claim_pathway'], BusinessClaim.Pathway.ESTABLISHED)
		self.assertFalse(verify_response.data['can_access_places'])
		self.assertIn('DiningDealz has received your business profile creation claim', verify_response.data['detail'])
		self.assertEqual(len(mail.outbox), 2)
		self.assertIn('received your business profile claim', mail.outbox[1].subject.lower())

		login_response = self.client.post(
			reverse('profile-login'),
			{
				'portal': 'business',
				'identifier': 'pending_bistro_owner',
				'password': 'test-pass-123',
			},
			format='json',
		)

		self.assertEqual(login_response.status_code, 400)
		self.assertEqual(
			login_response.data['non_field_errors'][0],
			'Your business claim must be approved by an admin before you can sign in to the business portal.',
		)

	@patch('places.views.get_source_place_payload')
	def test_verified_claimed_business_remains_pending_until_review(self, mock_get_source_place_payload):
		mock_get_source_place_payload.return_value = {
			'id': 402,
			'name': 'Finney\'s Crafthouse',
			'slug': 'finneys-crafthouse',
			'city': City.VENTURA,
			'venue_type': VenueType.RESTAURANT,
			'address_line_1': '494 E Main St',
			'address_line_2': '',
			'neighborhood': 'Downtown',
			'state': 'CA',
			'postal_code': '93001',
			'phone_number': '805-555-0199',
			'website_url': 'https://example.com/finneys',
			'locations': [],
		}

		signup_response = self.client.post(
			reverse('business-signup'),
			{
				'username': 'claimed_pending_owner',
				'email': 'claimed-pending@example.com',
				'password': 'test-pass-123',
				'first_name': 'Pat',
				'last_name': 'Claimant',
				'business_slug': 'finneys-crafthouse',
				'contact_name': 'Pat Claimant',
				'job_title': BusinessClaim.JobTitle.MANAGER,
				'work_email': 'pat@finneys.com',
				'work_phone': '805-555-0100',
				'employer_address': '494 E Main St, Ventura, CA 93001',
				'address_not_applicable': False,
				'verification_documents': json.dumps({
					'business_registration': ['CA business license #123'],
					'health_permit': ['Ventura County permit #A-55'],
					'abc_license': [],
					'proof_of_address_control': [],
				}),
				'proof_of_authority_attachments': [SimpleUploadedFile('manager-proof.pdf', b'proof', content_type='application/pdf')],
				'supporting_details': 'Available to provide payroll and licensing records upon request.',
			},
			format='multipart',
		)

		self.assertEqual(signup_response.status_code, 201)
		profile = AccountProfile.objects.get(user__username='claimed_pending_owner')

		verify_response = self.client.post(
			reverse('profile-verify-email-code'),
			{
				'username': 'claimed_pending_owner',
				'portal': 'business',
				'code': profile.email_verification_code,
			},
			format='json',
		)

		self.assertEqual(verify_response.status_code, 200)
		self.assertEqual(verify_response.data['auth_token'], '')
		self.assertTrue(verify_response.data['claim_review_pending'])
		self.assertEqual(verify_response.data['claim_pathway'], BusinessClaim.Pathway.CLAIMED)
		self.assertFalse(verify_response.data['can_access_places'])
		self.assertIn('DiningDealz has received your business profile creation claim', verify_response.data['detail'])

	def test_manual_mobile_business_signup_defaults_to_live_location_placeholder(self):
		response = self.client.post(
			reverse('manual-business-signup'),
			{
				'username': 'icecream_truck_owner',
				'email': 'icecream@example.com',
				'password': 'test-pass-123',
				'first_name': 'Taylor',
				'last_name': 'Driver',
				'business_name': 'Scoops Truck',
				'business_city': BusinessClaim.MULTIPLE_AREAS_VALUE,
				'business_venue_type': VenueType.MOBILE,
				'business_website_url': 'https://example.com/scoops-truck',
				'contact_name': 'Taylor Driver',
				'job_title': BusinessClaim.JobTitle.OWNER,
				'work_email': 'hello@scoopstruck.com',
				'work_phone': '805-555-0155',
				'employer_address': '',
				'address_not_applicable': False,
				'verification_documents': json.dumps({
					'business_registration': ['Ventura county vendor registration'],
					'health_permit': ['County mobile food permit'],
				}),
				'proof_of_authority_attachments': [SimpleUploadedFile('truck-proof.pdf', b'truck-proof', content_type='application/pdf')],
				'supporting_details': '',
			},
			format='multipart',
		)

		self.assertEqual(response.status_code, 201)
		claim = BusinessClaim.objects.select_related('listing_snapshot').get(claimant__username='icecream_truck_owner')
		self.assertTrue(claim.address_not_applicable)
		self.assertEqual(claim.listing_snapshot.venue_type, VenueType.MOBILE)
		self.assertEqual(claim.listing_snapshot.address_line_1, 'Approximate live location')

	@override_settings(
		EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
		PROFILE_EMAIL_VERIFICATION_URL_BASE='http://testserver/api/profiles/verify-email',
	)
	def test_manual_business_signup_reuses_rejected_account_with_same_email(self):
		rejected_user = User.objects.create_user(
			username='old_bistro_owner',
			email='retry@example.com',
			password='old-pass-123',
			first_name='Old',
			last_name='Owner',
		)
		AccountProfile.objects.create(user=rejected_user, email_verified_at=timezone.now())
		rejected_snapshot = ListingSnapshot.objects.create(
			name='Rejected Bistro',
			city=City.VENTURA,
			venue_type=VenueType.CAFE,
			address_line_1='10 Main St',
			source_name=BusinessClaim.MANUAL_SOURCE_NAME,
		)
		BusinessClaim.objects.create(
			claimant=rejected_user,
			listing_snapshot=rejected_snapshot,
			pathway=BusinessClaim.Pathway.ESTABLISHED,
			status=BusinessClaim.Status.REJECTED,
			contact_name='Old Owner',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='retry@example.com',
			work_phone='805-555-1111',
			employer_address='10 Main St',
			business_website_url='https://old-bistro.example.com',
			verification_summary='Rejected attempt.',
			rejection_reason_codes=[BusinessClaim.RejectionReason.ADDRESS_INVALID],
		)

		response = self.client.post(
			reverse('manual-business-signup'),
			{
				'username': 'retry_bistro_owner',
				'email': 'retry@example.com',
				'password': 'new-pass-123',
				'first_name': 'Retry',
				'last_name': 'Owner',
				'business_name': 'Retry Bistro',
				'business_city': City.OXNARD,
				'business_venue_type': VenueType.CAFE,
				'business_website_url': 'https://retry-bistro.example.com',
				'contact_name': 'Retry Owner',
				'job_title': BusinessClaim.JobTitle.OWNER,
				'work_email': 'retry@example.com',
				'work_phone': '805-555-0133',
				'employer_address': '55 Harbor Blvd',
				'address_not_applicable': False,
				'verification_documents': json.dumps({
					'business_registration': ['Updated registration'],
					'health_permit': ['Updated county permit'],
					'abc_license': [],
					'proof_of_address_control': [],
				}),
				'proof_of_authority_attachments': [SimpleUploadedFile('owner-proof.pdf', b'owner-proof', content_type='application/pdf')],
				'supporting_details': 'Retry submission after rejection.',
			},
			format='multipart',
		)

		self.assertEqual(response.status_code, 201)
		rejected_user.refresh_from_db()
		self.assertEqual(rejected_user.username, 'retry_bistro_owner')
		self.assertTrue(rejected_user.check_password('new-pass-123'))
		self.assertEqual(BusinessClaim.objects.filter(claimant=rejected_user).count(), 2)
		latest_claim = BusinessClaim.objects.filter(claimant=rejected_user).order_by('-created_at').first()
		self.assertEqual(latest_claim.status, BusinessClaim.Status.SUBMITTED)
		self.assertEqual(response.data['claim_status'], BusinessClaim.Status.SUBMITTED)
		self.assertTrue(response.data['claim_review_pending'])
		self.assertFalse(response.data.get('email_verification_required', False))
		self.assertIn('has received your business profile creation claim', response.data['detail'])

	@patch('places.views.get_source_place_payload')
	def test_claimed_business_signup_reuses_authenticated_customer_account(self, mock_get_source_place_payload):
		mock_get_source_place_payload.return_value = {
			'id': 402,
			'name': 'Finney\'s Crafthouse',
			'slug': 'finneys-crafthouse',
			'city': City.VENTURA,
			'venue_type': VenueType.RESTAURANT,
			'address_line_1': '494 E Main St',
			'address_line_2': '',
			'neighborhood': 'Downtown',
			'state': 'CA',
			'postal_code': '93001',
			'phone_number': '805-555-0199',
			'website_url': 'https://example.com/finneys',
			'locations': [],
		}
		user = User.objects.create_user(
			username='customer_to_business',
			email='customer@example.com',
			password='old-pass-123',
			first_name='Casey',
			last_name='Customer',
		)
		AccountProfile.objects.create(user=user, email_verified_at=timezone.now())
		token = ProfileAuthToken.objects.create(user=user)

		response = self.client.post(
			reverse('business-signup'),
			{
				'username': 'customer_to_business',
				'email': 'customer@example.com',
				'password': 'new-pass-123',
				'first_name': 'Casey',
				'last_name': 'Customer',
				'business_slug': 'finneys-crafthouse',
				'contact_name': 'Casey Customer',
				'job_title': BusinessClaim.JobTitle.MANAGER,
				'work_email': 'casey@finneys.com',
				'work_phone': '805-555-0100',
				'employer_address': '494 E Main St, Ventura, CA 93001',
				'address_not_applicable': False,
				'business_website_url': 'https://finneysventura.example.com',
				'social_media_links': json.dumps(['https://instagram.com/finneysventura']),
				'verification_documents': json.dumps({
					'business_registration': ['CA business license #123'],
					'health_permit': ['Ventura County permit #A-55'],
					'abc_license': [],
					'proof_of_address_control': [],
				}),
				'proof_of_authority_attachments': [SimpleUploadedFile('manager-proof.pdf', b'proof', content_type='application/pdf')],
				'supporting_details': 'Customer account converting to business claim.',
			},
			format='multipart',
			HTTP_AUTHORIZATION=f'Token {token.key}',
		)

		self.assertEqual(response.status_code, 201)
		self.assertEqual(response.data['auth_token'], token.key)
		self.assertEqual(response.data['claim_status'], BusinessClaim.Status.SUBMITTED)
		self.assertEqual(len(mail.outbox), 1)
		self.assertIn('customer@example.com', mail.outbox[0].to)
		self.assertIn('received your business profile claim', mail.outbox[0].subject.lower())
		user.refresh_from_db()
		self.assertTrue(user.check_password('new-pass-123'))
		self.assertEqual(BusinessClaim.objects.filter(claimant=user).count(), 1)

	@patch('places.views.get_source_place_payload')
	def test_claimed_business_signup_allows_new_attempt_after_rejection_for_same_user(self, mock_get_source_place_payload):
		mock_get_source_place_payload.return_value = {
			'id': 402,
			'name': 'Finney\'s Crafthouse',
			'slug': 'finneys-crafthouse',
			'city': City.VENTURA,
			'venue_type': VenueType.RESTAURANT,
			'address_line_1': '494 E Main St',
			'address_line_2': '',
			'neighborhood': 'Downtown',
			'state': 'CA',
			'postal_code': '93001',
			'phone_number': '805-555-0199',
			'website_url': 'https://example.com/finneys',
			'locations': [],
		}
		rejected_user = User.objects.create_user(username='finneys_retry', email='finneys-retry@example.com', password='old-pass-123')
		AccountProfile.objects.create(user=rejected_user)
		snapshot = ListingSnapshot.objects.create(
			name="Finney's Crafthouse",
			listing_slug='finneys-crafthouse',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='494 E Main St',
		)
		BusinessClaim.objects.create(
			claimant=rejected_user,
			listing_snapshot=snapshot,
			pathway=BusinessClaim.Pathway.CLAIMED,
			status=BusinessClaim.Status.REJECTED,
			contact_name='Pat Owner',
			job_title=BusinessClaim.JobTitle.MANAGER,
			work_email='pat@finneys.com',
			work_phone='805-555-0100',
			employer_address='494 E Main St, Ventura, CA 93001',
			business_website_url='https://finneysventura.example.com',
			verification_summary='Rejected claimed-business attempt.',
			rejection_reason_codes=[BusinessClaim.RejectionReason.PROOF_OF_AUTHORITY_INVALID],
		)

		response = self.client.post(
			reverse('business-signup'),
			{
				'username': 'finneys_retry',
				'email': 'finneys-retry@example.com',
				'password': 'test-pass-123',
				'first_name': 'Pat',
				'last_name': 'Owner',
				'business_slug': 'finneys-crafthouse',
				'contact_name': 'Pat Owner',
				'job_title': BusinessClaim.JobTitle.MANAGER,
				'work_email': 'pat@finneys.com',
				'work_phone': '805-555-0100',
				'employer_address': '494 E Main St, Ventura, CA 93001',
				'address_not_applicable': False,
				'business_website_url': 'https://finneysventura.example.com',
				'social_media_links': json.dumps(['https://instagram.com/finneysventura']),
				'verification_documents': json.dumps({
					'business_registration': ['CA business license #123'],
					'health_permit': ['Ventura County permit #A-55'],
					'abc_license': [],
					'proof_of_address_control': [],
				}),
				'proof_of_authority_attachments': [SimpleUploadedFile('manager-proof.pdf', b'proof', content_type='application/pdf')],
				'supporting_details': 'Second attempt after rejection.',
			},
			format='multipart',
		)

		self.assertEqual(response.status_code, 201)
		self.assertEqual(BusinessClaim.objects.filter(claimant=rejected_user, listing_snapshot=snapshot).count(), 2)
		latest_claim = BusinessClaim.objects.filter(claimant=rejected_user, listing_snapshot=snapshot).order_by('-created_at').first()
		self.assertEqual(latest_claim.status, BusinessClaim.Status.SUBMITTED)

	def test_informal_business_signup_creates_informal_claim(self):
		response = self.client.post(
			reverse('informal-business-signup'),
			{
				'username': 'street_vendor',
				'email': 'vendor@example.com',
				'password': 'test-pass-123',
				'first_name': 'Riley',
				'last_name': 'Vendor',
				'business_name': 'Riley Snacks',
				'business_city': BusinessClaim.MULTIPLE_AREAS_VALUE,
				'business_venue_type': VenueType.FAST_FOOD,
				'business_website_url': '',
				'social_media_links': ['https://instagram.com/rileysnacks'],
				'offer_entries': ['2 tacos for $5'],
				'hours_of_operation_entries': ['Fri-Sun 6pm-11pm'],
				'photo_references': ['https://example.com/rileysnacks-cart.jpg'],
				'supporting_details': 'I operate this snack stand at weekend events and night markets.',
			},
			format='json',
		)

		self.assertEqual(response.status_code, 201)
		claim = BusinessClaim.objects.select_related('listing_snapshot').get(claimant__username='street_vendor')
		self.assertEqual(claim.pathway, BusinessClaim.Pathway.INFORMAL)
		self.assertTrue(claim.serves_multiple_areas)
		self.assertEqual(claim.listing_snapshot.address_line_1, 'Approximate live location')
		self.assertEqual(
			claim.get_profile_entry_values(BusinessClaim.ProfileEntryKind.OFFER),
			['2 tacos for $5'],
		)

	def test_informal_business_signup_accepts_uploaded_business_photos(self):
		with TemporaryDirectory() as temp_dir:
			with override_settings(MEDIA_ROOT=Path(temp_dir)):
				response = self.client.post(
					reverse('informal-business-signup'),
					{
						'username': 'vendor_with_photos',
						'email': 'vendor-photos@example.com',
						'password': 'test-pass-123',
						'first_name': 'Riley',
						'last_name': 'Vendor',
						'business_name': 'Riley Snacks',
						'business_city': BusinessClaim.MULTIPLE_AREAS_VALUE,
						'business_venue_type': VenueType.FAST_FOOD,
						'business_website_url': '',
						'social_media_links': json.dumps(['https://instagram.com/rileysnacks']),
						'offer_entries': json.dumps(['2 tacos for $5']),
						'hours_of_operation_entries': json.dumps(['Fri-Sun 6pm-11pm']),
						'profile_photo_uploads': [
							SimpleUploadedFile('cart.jpg', b'cart-photo', content_type='image/jpeg'),
						],
						'supporting_details': 'I operate this snack stand at weekend events and night markets.',
					},
					format='multipart',
				)

		self.assertEqual(response.status_code, 201)
		claim = BusinessClaim.objects.get(claimant__username='vendor_with_photos')
		self.assertEqual(len(claim.photo_references), 1)
		self.assertTrue(claim.photo_gallery_overridden)
		self.assertEqual(
			claim.get_profile_entry_values(BusinessClaim.ProfileEntryKind.PHOTO_REFERENCE),
			claim.photo_references,
		)

	def test_informal_business_signup_requires_presence_signal_and_summary(self):
		response = self.client.post(
			reverse('informal-business-signup'),
			{
				'username': 'empty_vendor',
				'email': 'empty@example.com',
				'password': 'test-pass-123',
				'first_name': 'Empty',
				'last_name': 'Vendor',
				'business_name': 'Empty Booth',
				'business_city': BusinessClaim.MULTIPLE_AREAS_VALUE,
				'business_venue_type': VenueType.OTHER,
			},
			format='json',
		)

		self.assertEqual(response.status_code, 400)
		self.assertIn('Small startups and vendors need at least one social link, website, or photo reference before submission.', str(response.data))

	def test_manual_business_signup_accepts_multiple_social_and_verification_attachments(self):
		with TemporaryDirectory() as temp_dir:
			with override_settings(MEDIA_ROOT=Path(temp_dir)):
				response = self.client.post(
					reverse('manual-business-signup'),
					{
						'username': 'attachment_owner',
						'email': 'attachment@example.com',
						'password': 'test-pass-123',
						'first_name': 'File',
						'last_name': 'Owner',
						'business_name': 'Attachment Bistro',
						'business_city': BusinessClaim.MULTIPLE_AREAS_VALUE,
						'business_venue_type': VenueType.CAFE,
						'business_website_url': 'https://example.com/attachment-bistro',
						'contact_name': 'File Owner',
						'job_title': BusinessClaim.JobTitle.OWNER,
						'work_email': 'owner@attachmentbistro.com',
						'work_phone': '805-555-0198',
						'employer_address': '',
						'address_not_applicable': 'true',
						'social_media_links': json.dumps(['https://instagram.com/attachmentbistro']),
						'verification_documents': json.dumps({
							'business_registration': [],
							'health_permit': [],
							'abc_license': [],
							'proof_of_address_control': [],
						}),
						'social_media_attachments': [
							SimpleUploadedFile('instagram-proof.pdf', b'social-proof', content_type='application/pdf'),
							SimpleUploadedFile('facebook-proof.pdf', b'second-social-proof', content_type='application/pdf'),
						],
						'business_registration_attachments': [
							SimpleUploadedFile('business-license.pdf', b'business-license', content_type='application/pdf'),
						],
						'health_permit_attachments': [
							SimpleUploadedFile('health-permit.pdf', b'health-permit', content_type='application/pdf'),
						],
						'proof_of_authority_attachments': [
							SimpleUploadedFile('authority.pdf', b'authority-proof', content_type='application/pdf'),
						],
					},
					format='multipart',
				)

				self.assertEqual(response.status_code, 201)
				claim = BusinessClaim.objects.get(claimant__username='attachment_owner')
				attachments = list(claim.attachments.order_by('attachment_kind', 'original_filename'))
				self.assertEqual(len(attachments), 5)
				self.assertEqual(
					[attachment.attachment_kind for attachment in attachments],
					[
						BusinessClaimAttachment.AttachmentKind.BUSINESS_REGISTRATION,
						BusinessClaimAttachment.AttachmentKind.HEALTH_PERMIT,
						BusinessClaimAttachment.AttachmentKind.PROOF_OF_AUTHORITY,
						BusinessClaimAttachment.AttachmentKind.SOCIAL_MEDIA,
						BusinessClaimAttachment.AttachmentKind.SOCIAL_MEDIA,
					],
				)

	def test_manual_business_signup_accepts_uploaded_business_photos(self):
		with TemporaryDirectory() as temp_dir:
			with override_settings(MEDIA_ROOT=Path(temp_dir)):
				response = self.client.post(
					reverse('manual-business-signup'),
					{
						'username': 'manual_photo_owner',
						'email': 'manual-photo@example.com',
						'password': 'test-pass-123',
						'first_name': 'Casey',
						'last_name': 'Founder',
						'business_name': 'Corner Bistro',
						'business_city': City.VENTURA,
						'business_venue_type': VenueType.CAFE,
						'business_website_url': 'https://example.com/corner-bistro',
						'contact_name': 'Casey Founder',
						'job_title': BusinessClaim.JobTitle.OWNER,
						'work_email': 'owner@cornerbistro.com',
						'work_phone': '805-555-0133',
						'employer_address': '123 Ventura Ave',
						'address_not_applicable': False,
						'verification_documents': json.dumps({
							'business_registration': ['Articles of organization filed with CA Secretary of State'],
							'health_permit': ['Ventura County temporary permit receipt'],
							'abc_license': [],
							'proof_of_address_control': [],
						}),
						'proof_of_authority_attachments': [SimpleUploadedFile('owner-proof.pdf', b'owner-proof', content_type='application/pdf')],
						'profile_photo_uploads': [
							SimpleUploadedFile('patio.jpg', b'patio-photo', content_type='image/jpeg'),
						],
						'supporting_details': 'Happy to provide incorporation documents during review.',
					},
					format='multipart',
				)

		self.assertEqual(response.status_code, 201)
		claim = BusinessClaim.objects.get(claimant__username='manual_photo_owner')
		self.assertEqual(len(claim.photo_references), 1)
		self.assertTrue(claim.photo_gallery_overridden)
		self.assertEqual(
			claim.get_profile_entry_values(BusinessClaim.ProfileEntryKind.PHOTO_REFERENCE),
			claim.photo_references,
		)

	def test_business_portal_login_rejects_unapproved_claim(self):
		user = User.objects.create_user(username='pending_owner', email='pending@example.com', password='test-pass-123')
		snapshot = ListingSnapshot.objects.create(
			name='Pending Place',
			city=City.OXNARD,
			venue_type=VenueType.RESTAURANT,
			address_line_1='101 Harbor Blvd',
		)
		BusinessClaim.objects.create(
			claimant=user,
			listing_snapshot=snapshot,
			contact_name='Pending Owner',
			job_title='Owner',
			work_email='pending@place.com',
			employer_address='101 Harbor Blvd',
			verification_summary='Please review my claim.',
			status=BusinessClaim.Status.SUBMITTED,
		)

		response = self.client.post(
			reverse('profile-login'),
			{
				'portal': 'business',
				'identifier': 'pending_owner',
				'password': 'test-pass-123',
			},
			format='json',
		)

		self.assertEqual(response.status_code, 400)
		self.assertEqual(
			response.data['non_field_errors'][0],
			'Your business claim must be approved by an admin before you can sign in to the business portal.',
		)

	def test_login_requires_authenticator_code_when_two_factor_is_enabled(self):
		user = User.objects.create_user(username='secure_customer', email='secure@example.com', password='test-pass-123')
		profile = AccountProfile.objects.create(user=user, email_verified_at=timezone.now(), two_factor_enabled=True, two_factor_secret=pyotp.random_base32())

		response = self.client.post(
			reverse('profile-login'),
			{
				'portal': 'customer',
				'identifier': 'secure_customer',
				'password': 'test-pass-123',
			},
			format='json',
		)

		self.assertEqual(response.status_code, 400)
		self.assertIn('two_factor_code', response.data)
		self.assertTrue(profile.two_factor_enabled)

	def test_login_accepts_authenticator_code_when_two_factor_is_enabled(self):
		user = User.objects.create_user(username='secure_login', email='secure-login@example.com', password='test-pass-123')
		secret = pyotp.random_base32()
		AccountProfile.objects.create(user=user, email_verified_at=timezone.now(), two_factor_enabled=True, two_factor_secret=secret)

		response = self.client.post(
			reverse('profile-login'),
			{
				'portal': 'customer',
				'identifier': 'secure_login',
				'password': 'test-pass-123',
				'two_factor_code': pyotp.TOTP(secret).now(),
			},
			format='json',
		)

		self.assertEqual(response.status_code, 200)
		self.assertTrue(response.data['auth_token'])

	def test_login_allows_multiple_area_informal_vendor_without_city(self):
		user = User.objects.create_user(username='mobile_vendor', email='mobile-vendor@example.com', password='test-pass-123')
		AccountProfile.objects.create(user=user, email_verified_at=timezone.now())
		snapshot = ListingSnapshot.objects.create(
			name='Mobile Vendor',
			city='',
			venue_type=VenueType.FAST_FOOD,
			address_line_1='Approximate live location',
			serves_multiple_areas=True,
			source_name=BusinessClaim.MANUAL_SOURCE_NAME,
		)
		claim = BusinessClaim.objects.create(
			claimant=user,
			listing_snapshot=snapshot,
			pathway=BusinessClaim.Pathway.INFORMAL,
			status=BusinessClaim.Status.APPROVED,
			contact_name='Mobile Vendor',
			work_email='mobile-vendor@example.com',
			address_not_applicable=True,
			serves_multiple_areas=True,
			verification_summary='Approved multiple-area vendor.',
		)
		BusinessMembership.objects.create(user=user, claim=claim, is_active=True)

		response = self.client.post(
			reverse('profile-login'),
			{
				'portal': 'business',
				'identifier': 'mobile_vendor',
				'password': 'test-pass-123',
			},
			format='json',
		)

		self.assertEqual(response.status_code, 200)
		self.assertTrue(response.data['auth_token'])
		self.assertEqual(response.data['business_name'], 'Mobile Vendor')
		self.assertTrue(response.data['business_location_tracking_available'])

	def test_login_rejects_business_account_on_customer_portal(self):
		user = User.objects.create_user(username='business_portal_only', email='business-portal@example.com', password='test-pass-123')
		AccountProfile.objects.create(user=user, email_verified_at=timezone.now())
		snapshot = ListingSnapshot.objects.create(
			name='Portal Only Business',
			city=City.OXNARD,
			venue_type=VenueType.RESTAURANT,
			address_line_1='101 Harbor Blvd',
		)
		claim = BusinessClaim.objects.create(
			claimant=user,
			listing_snapshot=snapshot,
			contact_name='Portal Only Owner',
			job_title='Owner',
			work_email='owner@portal-only-business.com',
			employer_address='101 Harbor Blvd',
			verification_summary='Approved owner for portal access testing.',
			status=BusinessClaim.Status.APPROVED,
		)
		BusinessMembership.objects.create(user=user, claim=claim, is_active=True)

		response = self.client.post(
			reverse('profile-login'),
			{
				'portal': 'customer',
				'identifier': 'business_portal_only',
				'password': 'test-pass-123',
			},
			format='json',
		)

		self.assertEqual(response.status_code, 400)
		self.assertEqual(
			response.data['non_field_errors'][0],
			'Business accounts must sign in through the business account portal.',
		)

	def test_login_rejects_email_identifier(self):
		user = User.objects.create_user(username='email_login_user', email='email-login@example.com', password='test-pass-123')

		response = self.client.post(
			reverse('profile-login'),
			{
				'portal': 'customer',
				'identifier': user.email,
				'password': 'test-pass-123',
			},
			format='json',
		)

		self.assertEqual(response.status_code, 400)
		self.assertEqual(response.data['non_field_errors'][0], 'No account matches that username.')

	def test_login_returns_email_verification_challenge_for_unverified_account(self):
		user = User.objects.create_user(
			username='needsverify',
			email='needsverify@example.com',
			password='test-pass-123',
		)
		profile = AccountProfile.objects.create(user=user)
		profile.issue_email_verification_code(force=True)
		profile.email_verification_sent_at = profile.email_verification_code_sent_at
		profile.save(update_fields=['email_verification_code', 'email_verification_code_sent_at', 'email_verification_sent_at', 'updated_at'])

		response = self.client.post(
			reverse('profile-login'),
			{
				'portal': 'customer',
				'identifier': 'needsverify',
				'password': 'test-pass-123',
			},
			format='json',
		)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data['auth_token'], '')
		self.assertTrue(response.data['email_verification_required'])
		self.assertFalse(response.data['can_access_places'])

	def test_verify_email_code_returns_token_and_marks_email_verified(self):
		signup_response = self.client.post(
			reverse('customer-signup'),
			{
				'username': 'code_verify_user',
				'email': 'code-verify@example.com',
				'password': 'test-pass-123',
				'first_name': 'Code',
				'last_name': 'Verify',
			},
			format='json',
		)

		self.assertEqual(signup_response.status_code, 201)
		profile = AccountProfile.objects.get(user__username='code_verify_user')

		verify_response = self.client.post(
			reverse('profile-verify-email-code'),
			{
				'username': 'code_verify_user',
				'portal': 'customer',
				'code': profile.email_verification_code,
			},
			format='json',
		)

		self.assertEqual(verify_response.status_code, 200)
		self.assertTrue(verify_response.data['auth_token'])
		profile.refresh_from_db()
		self.assertTrue(profile.email_is_verified)
		self.assertEqual(profile.email_verification_code, '')

	def test_resend_email_code_requires_previous_code_to_expire(self):
		signup_response = self.client.post(
			reverse('customer-signup'),
			{
				'username': 'resend_gate_user',
				'email': 'resend@example.com',
				'password': 'test-pass-123',
				'first_name': 'Resend',
				'last_name': 'Gate',
			},
			format='json',
		)

		self.assertEqual(signup_response.status_code, 201)
		resend_response = self.client.post(
			reverse('profile-resend-verification-code'),
			{
				'username': 'resend_gate_user',
				'portal': 'customer',
			},
			format='json',
		)

		self.assertEqual(resend_response.status_code, 400)
		self.assertIn('seconds_remaining', resend_response.data)


@override_settings(
	EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
	PROFILE_EMAIL_VERIFICATION_URL_BASE='http://testserver/api/profiles/verify-email',
)
class ProfileDashboardApiTests(APITestCase):
	def setUp(self):
		self.user = User.objects.create_user(
			username='dashboard_user',
			email='dashboard@example.com',
			password='test-pass-123',
			first_name='Dash',
			last_name='Board',
		)
		self.profile = AccountProfile.objects.create(user=self.user, billing_portal_url='https://example.com/billing')
		self.token = ProfileAuthToken.objects.create(user=self.user)
		self.favorite_place_payload = {
			'id': 998,
			'name': 'Favorite Tacos',
			'slug': 'favorite-tacos-ventura',
			'city': City.VENTURA,
			'city_label': 'Ventura',
			'venue_type': VenueType.RESTAURANT,
			'venue_type_label': 'Restaurant',
			'address_line_1': '123 Main St',
			'website_url': 'https://example.com/favorite-tacos',
		}

	def auth_headers(self):
		return {'HTTP_AUTHORIZATION': f'Token {self.token.key}'}

	def test_profile_dashboard_returns_business_details_for_approved_membership(self):
		snapshot = ListingSnapshot.objects.create(
			name='Approved Spot',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='55 Main St',
		)
		claim = BusinessClaim.objects.create(
			claimant=self.user,
			listing_snapshot=snapshot,
			contact_name='Dash Board',
			job_title='Owner',
			work_email='owner@approvedspot.com',
			work_phone='805-555-0200',
			employer_address='55 Main St, Ventura, CA 93001',
			deal_overrides=[{
				'title': 'Dashboard Happy Hour',
				'description': '$3 off cocktails',
				'deal_type': DealType.HAPPY_HOUR,
				'price_text': '$3 Off',
				'terms': 'Dine-in only',
				'happy_hours': [{'weekday': Weekday.THURSDAY, 'start_time': '15:00', 'end_time': '18:00', 'all_day': False}],
			}],
			operating_hour_overrides=[{'weekday': Weekday.THURSDAY, 'open_time': '11:00', 'close_time': '22:00'}],
			social_profiles={
				'website': {
					'url': 'https://approved.example.com/old',
					'username': 'approved.example.com',
				},
				'instagram': {
					'url': 'https://instagram.com/approvedspot',
					'username': 'approvedspot',
				},
			},
			verification_summary='I own the business.',
			status=BusinessClaim.Status.APPROVED,
		)
		membership = BusinessMembership.objects.create(claim=claim, user=self.user, is_active=True)
		post = BusinessPost.objects.create(
			membership=membership,
			listing_snapshot=snapshot,
			content_type=BusinessPost.ContentType.SPECIAL,
			status=BusinessPost.Status.PUBLISHED,
			title='Late Night Spotlight',
			summary='A boosted special for the dashboard.',
			published_at=timezone.now() - timedelta(hours=2),
		)
		campaign = SponsoredCampaign.objects.create(
			membership=membership,
			post=post,
			name='Weekly Spotlight',
			status=SponsoredCampaign.Status.ACTIVE,
			weekly_price_cents=1500,
			weekly_impression_quota=500,
			starts_at=timezone.now() - timedelta(days=1),
		)
		for index in range(3):
			impression = FeedImpression.objects.create(
				post=post,
				campaign=campaign,
				placement_type=FeedImpression.PlacementType.SPONSORED,
				feed_item_id=f'campaign-{campaign.pk}',
				position=index,
			)
			if index < 2:
				FeedEngagement.objects.create(
					post=post,
					campaign=campaign,
					impression=impression,
					event_type=FeedEngagement.EventType.CLICK,
					feed_item_id=f'campaign-{campaign.pk}',
				)

		response = self.client.get(reverse('profile-dashboard'), {'portal': 'business'}, **self.auth_headers())

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data['profile_type'], 'business')
		self.assertEqual(response.data['business_status'], 'approved')
		self.assertEqual(response.data['billing_portal_url'], 'https://example.com/billing')
		self.assertEqual(len(response.data['approved_businesses']), 1)
		self.assertEqual(response.data['approved_businesses'][0]['slug'], snapshot.listing_slug)
		self.assertEqual(response.data['approved_businesses'][0]['name'], 'Approved Spot')
		self.assertEqual(response.data['business_contact']['work_email'], 'owner@approvedspot.com')
		self.assertEqual(response.data['approved_businesses'][0]['address_line_1'], '55 Main St')
		self.assertEqual(len(response.data['sponsored_campaigns']), 1)
		self.assertEqual(response.data['sponsored_campaigns'][0]['name'], 'Weekly Spotlight')
		self.assertEqual(response.data['sponsored_campaigns'][0]['impressions_last_7_days'], 3)
		self.assertEqual(response.data['sponsored_campaigns'][0]['clicks_last_7_days'], 2)
		self.assertEqual(response.data['sponsored_campaigns'][0]['remaining_impressions'], 497)
		self.assertEqual(response.data['sponsored_campaigns'][0]['post']['title'], 'Late Night Spotlight')
		self.assertEqual(response.data['business_contact']['offer_entries'], [])
		self.assertEqual(response.data['business_contact']['deals'][0]['title'], 'Dashboard Happy Hour')
		self.assertEqual(response.data['business_contact']['operating_hours'][0]['weekday'], Weekday.THURSDAY)
		self.assertEqual(
			response.data['business_contact']['social_profiles'],
			{
				'website': {
					'url': 'https://approved.example.com/old',
					'username': 'approved.example.com',
				},
				'instagram': {
					'url': 'https://instagram.com/approvedspot',
					'username': 'approvedspot',
				},
			},
		)

	def test_profile_dashboard_update_allows_approved_business_profile_edits(self):
		snapshot = ListingSnapshot.objects.create(
			name='Approved Spot',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='55 Main St',
			website_url='https://approved.example.com/old',
		)
		claim = BusinessClaim.objects.create(
			claimant=self.user,
			listing_snapshot=snapshot,
			contact_name='Dash Board',
			job_title='Owner',
			work_email='owner@approvedspot.com',
			work_phone='805-555-0200',
			employer_address='55 Main St, Ventura, CA 93001',
			business_website_url='https://approved.example.com/old',
			verification_summary='I own the business.',
			status=BusinessClaim.Status.APPROVED,
		)
		BusinessMembership.objects.create(claim=claim, user=self.user, is_active=True)

		response = self.client.post(
			reverse('profile-dashboard'),
			{
				'portal': 'business',
				'username': 'dashboard_user',
				'email': 'dashboard@example.com',
				'first_name': 'Dash',
				'last_name': 'Board',
				'contact_name': 'Casey Manager',
				'job_title': 'General Manager',
				'work_email': 'manager@approvedspot.com',
				'work_phone': '805-555-0211',
				'employer_address': '57 Main St, Ventura, CA 93001',
				'business_website_url': 'https://approved.example.com/new',
				'social_profiles': {
					'website': {
						'url': 'https://approved.example.com/new',
						'username': 'approved.example.com',
					},
					'instagram': {
						'url': 'https://instagram.com/approvedspot',
						'username': 'approvedspot',
					},
					'facebook': {
						'url': 'https://facebook.com/approvedspot',
						'username': 'approvedspot',
					},
				},
				'offer_entries_text': 'Happy hour tacos $5\nHalf off appetizers',
				'hours_of_operation_entries_text': 'Mon-Fri 3pm-6pm\nSat-Sun 11am-10pm',
				'photo_references_text': 'https://cdn.example.com/approvedspot/front.jpg',
				'supporting_details': 'Updated from the approved business dashboard.',
			},
			format='json',
			**self.auth_headers(),
		)

		self.assertEqual(response.status_code, 200)
		claim.refresh_from_db()
		snapshot.refresh_from_db()
		self.assertEqual(claim.contact_name, 'Casey Manager')
		self.assertEqual(claim.work_email, 'manager@approvedspot.com')
		self.assertEqual(claim.offer_entries, ['Happy hour tacos $5', 'Half off appetizers'])
		self.assertEqual(claim.hours_of_operation_entries, ['Mon-Fri 3pm-6pm', 'Sat-Sun 11am-10pm'])
		self.assertEqual(claim.photo_references, ['https://cdn.example.com/approvedspot/front.jpg'])
		self.assertEqual(
			claim.social_profiles,
			{
				'website': {
					'url': 'https://approved.example.com/new',
					'username': 'approved.example.com',
				},
				'instagram': {
					'url': 'https://instagram.com/approvedspot',
					'username': 'approvedspot',
				},
				'facebook': {
					'url': 'https://facebook.com/approvedspot',
					'username': 'approvedspot',
				},
			},
		)
		self.assertEqual(claim.supporting_details, 'Updated from the approved business dashboard.')
		self.assertEqual(snapshot.website_url, 'https://approved.example.com/old')
		self.assertEqual(
			claim.get_profile_entry_values(BusinessClaim.ProfileEntryKind.OFFER),
			['Happy hour tacos $5', 'Half off appetizers'],
		)
		self.assertEqual(response.data['business_contact']['business_website_url'], 'https://approved.example.com/new')
		self.assertEqual(
			response.data['business_contact']['social_profiles'],
			{
				'website': {
					'url': 'https://approved.example.com/new',
					'username': 'approved.example.com',
				},
				'instagram': {
					'url': 'https://instagram.com/approvedspot',
					'username': 'approvedspot',
				},
				'facebook': {
					'url': 'https://facebook.com/approvedspot',
					'username': 'approvedspot',
				},
			},
		)
		self.assertEqual(response.data['business_contact']['social_media_links'], ['https://instagram.com/approvedspot', 'https://facebook.com/approvedspot'])

	def test_profile_dashboard_update_accepts_24_hour_business_hours(self):
		snapshot = ListingSnapshot.objects.create(
			name='Open Late Cafe',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='77 Main St',
		)
		claim = BusinessClaim.objects.create(
			claimant=self.user,
			listing_snapshot=snapshot,
			contact_name='Dash Board',
			job_title='Owner',
			work_email='owner@openlate.example.com',
			work_phone='805-555-0200',
			employer_address='77 Main St, Ventura, CA 93001',
			verification_summary='I own the business.',
			status=BusinessClaim.Status.APPROVED,
		)
		BusinessMembership.objects.create(claim=claim, user=self.user, is_active=True)

		response = self.client.post(
			reverse('profile-dashboard'),
			{
				'portal': 'business',
				'username': 'dashboard_user',
				'email': 'dashboard@example.com',
				'contact_name': 'Casey Manager',
				'operating_hour_overrides': [
					{'weekday': Weekday.FRIDAY, 'open_24_hours': True},
				],
			},
			format='json',
			**self.auth_headers(),
		)

		self.assertEqual(response.status_code, 200)
		claim.refresh_from_db()
		self.assertEqual(claim.operating_hour_overrides, [{
			'weekday': Weekday.FRIDAY,
			'open_time': '00:00',
			'close_time': '23:59',
			'open_24_hours': True,
		}])
		self.assertEqual(response.data['business_contact']['operating_hours'][0]['open_24_hours'], True)
		self.assertEqual(response.data['business_contact']['hours_of_operation_entries'], ['Friday: Open 24 hours'])

	def test_profile_dashboard_update_accepts_business_profile_photo_uploads(self):
		snapshot = ListingSnapshot.objects.create(
			name='Approved Spot',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='55 Main St',
		)
		claim = BusinessClaim.objects.create(
			claimant=self.user,
			listing_snapshot=snapshot,
			contact_name='Dash Board',
			job_title='Owner',
			work_email='owner@approvedspot.com',
			work_phone='805-555-0200',
			employer_address='55 Main St, Ventura, CA 93001',
			verification_summary='I own the business.',
			status=BusinessClaim.Status.APPROVED,
		)
		BusinessMembership.objects.create(claim=claim, user=self.user, is_active=True)

		with TemporaryDirectory() as temp_dir:
			with override_settings(MEDIA_ROOT=Path(temp_dir)):
				response = self.client.post(
					reverse('profile-dashboard'),
					{
						'portal': 'business',
						'username': 'dashboard_user',
						'email': 'dashboard@example.com',
						'first_name': 'Dash',
						'last_name': 'Board',
						'contact_name': 'Dash Board',
						'work_email': 'owner@approvedspot.com',
						'photo_references_text': 'https://cdn.example.com/approvedspot/front.jpg',
						'profile_photo_uploads': [SimpleUploadedFile('dining-room.png', b'fake-image-bytes', content_type='image/png')],
					},
					format='multipart',
					**self.auth_headers(),
				)

		self.assertEqual(response.status_code, 200)
		claim.refresh_from_db()
		self.assertEqual(len(claim.photo_references), 2)
		self.assertEqual(claim.photo_references[0], 'https://cdn.example.com/approvedspot/front.jpg')
		self.assertIn('/business-profile-photos/', claim.photo_references[1])
		self.assertTrue(claim.photo_gallery_overridden)
		self.assertIn(claim.photo_references[1], response.data['business_contact']['photo_references'])

	@patch('places.services.source_listings.load_source_records')
	def test_profile_dashboard_returns_inherited_source_images_until_owner_overrides_gallery(self, mock_load_source_records):
		mock_load_source_records.return_value = [
			ImportedPlace(
				name='Approved Spot',
				profile_name='Approved Spot',
				profile_slug='approved-spot',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='55 Main St',
				website_url='https://approved.example.com',
				image_urls=['https://images.example.com/approvedspot/front.jpg', 'https://images.example.com/approvedspot/patio.jpg'],
			)
		]
		snapshot = ListingSnapshot.objects.create(
			name='Approved Spot',
			listing_slug='approved-spot',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='55 Main St',
		)
		claim = BusinessClaim.objects.create(
			claimant=self.user,
			listing_snapshot=snapshot,
			contact_name='Dash Board',
			job_title='Owner',
			work_email='owner@approvedspot.com',
			work_phone='805-555-0200',
			employer_address='55 Main St, Ventura, CA 93001',
			verification_summary='I own the business.',
			status=BusinessClaim.Status.APPROVED,
		)
		BusinessMembership.objects.create(claim=claim, user=self.user, is_active=True)

		response = self.client.get(reverse('profile-dashboard'), {'portal': 'business'}, **self.auth_headers())

		self.assertEqual(response.status_code, 200)
		self.assertEqual(
			response.data['business_contact']['photo_references'],
			['https://images.example.com/approvedspot/front.jpg', 'https://images.example.com/approvedspot/patio.jpg'],
		)

		update_response = self.client.post(
			reverse('profile-dashboard'),
			{
				'portal': 'business',
				'username': 'dashboard_user',
				'email': 'dashboard@example.com',
				'first_name': 'Dash',
				'last_name': 'Board',
				'contact_name': 'Dash Board',
				'work_email': 'owner@approvedspot.com',
				'photo_references_text': 'https://images.example.com/approvedspot/patio.jpg',
			},
			format='json',
			**self.auth_headers(),
		)

		self.assertEqual(update_response.status_code, 200)
		claim.refresh_from_db()
		self.assertTrue(claim.photo_gallery_overridden)
		self.assertEqual(claim.photo_references, ['https://images.example.com/approvedspot/patio.jpg'])

		payload = get_source_place_payload('approved-spot')
		self.assertEqual(payload['image_urls'], ['https://images.example.com/approvedspot/patio.jpg'])

	def test_profile_dashboard_includes_mobile_location_tracking_status(self):
		snapshot = ListingSnapshot.objects.create(
			name='Scoops Truck',
			city=City.VENTURA,
			venue_type=VenueType.MOBILE,
			address_line_1='Approximate live location',
			tracked_location_latitude=34.2791,
			tracked_location_longitude=-119.2908,
			tracked_location_accuracy_meters=42.0,
			tracked_location_updated_at=timezone.now(),
		)
		claim = BusinessClaim.objects.create(
			claimant=self.user,
			listing_snapshot=snapshot,
			contact_name='Dash Board',
			job_title='Owner',
			work_email='owner@scoops.example.com',
			employer_address='',
			verification_summary='I operate the truck.',
			status=BusinessClaim.Status.APPROVED,
		)
		BusinessMembership.objects.create(claim=claim, user=self.user, is_active=True)

		response = self.client.get(reverse('profile-dashboard'), {'portal': 'business'}, **self.auth_headers())

		self.assertEqual(response.status_code, 200)
		self.assertTrue(response.data['business_location_tracking_available'])
		self.assertTrue(response.data['business_location_tracking_enabled'])
		self.assertTrue(response.data['requires_business_location_tracking'])
		self.assertEqual(response.data['tracked_business_location']['latitude'], 34.2791)
		self.assertEqual(response.data['tracked_business_location']['accuracy_meters'], 42.0)

	def test_profile_dashboard_includes_disabled_mobile_location_tracking_preference(self):
		self.profile.business_location_tracking_enabled = False
		self.profile.save(update_fields=['business_location_tracking_enabled', 'updated_at'])
		snapshot = ListingSnapshot.objects.create(
			name='Scoops Truck',
			city=City.VENTURA,
			venue_type=VenueType.MOBILE,
			address_line_1='Approximate live location',
		)
		claim = BusinessClaim.objects.create(
			claimant=self.user,
			listing_snapshot=snapshot,
			contact_name='Dash Board',
			job_title='Owner',
			work_email='owner@scoops.example.com',
			employer_address='',
			verification_summary='I operate the truck.',
			status=BusinessClaim.Status.APPROVED,
		)
		BusinessMembership.objects.create(claim=claim, user=self.user, is_active=True)

		response = self.client.get(reverse('profile-dashboard'), {'portal': 'business'}, **self.auth_headers())

		self.assertEqual(response.status_code, 200)
		self.assertTrue(response.data['business_location_tracking_available'])
		self.assertFalse(response.data['business_location_tracking_enabled'])
		self.assertFalse(response.data['requires_business_location_tracking'])

	def test_profile_dashboard_update_changes_basic_customer_details(self):
		self.profile.email_verified_at = timezone.now()
		self.profile.save(update_fields=['email_verified_at', 'updated_at'])

		response = self.client.post(
			reverse('profile-dashboard'),
			{
				'portal': 'customer',
				'username': 'dashboard_user_renamed',
				'email': 'dashboard@example.com',
				'first_name': 'Updated',
				'last_name': 'Name',
			},
			format='json',
			**self.auth_headers(),
		)

		self.assertEqual(response.status_code, 200)
		self.user.refresh_from_db()
		self.assertEqual(self.user.username, 'dashboard_user_renamed')
		self.assertEqual(self.user.first_name, 'Updated')
		self.assertEqual(self.user.last_name, 'Name')
		self.assertEqual(response.data['detail'], 'Profile updated.')
		self.assertTrue(response.data['email_verified'])

	def test_profile_dashboard_update_email_requires_reverification(self):
		self.profile.email_verified_at = timezone.now()
		self.profile.save(update_fields=['email_verified_at', 'updated_at'])

		response = self.client.post(
			reverse('profile-dashboard'),
			{
				'portal': 'customer',
				'username': 'dashboard_user',
				'email': 'new-dashboard@example.com',
				'first_name': 'Dash',
				'last_name': 'Board',
			},
			format='json',
			**self.auth_headers(),
		)

		self.assertEqual(response.status_code, 200)
		self.user.refresh_from_db()
		self.profile.refresh_from_db()
		self.assertEqual(self.user.email, 'new-dashboard@example.com')
		self.assertEqual(self.profile.pending_email, 'new-dashboard@example.com')
		self.assertEqual(self.profile.previous_verified_email, 'dashboard@example.com')
		self.assertFalse(self.profile.email_is_verified)
		self.assertFalse(response.data['email_verified'])
		self.assertEqual(response.data['detail'], 'Profile updated. Verify your new email address to finish the email change.')
		self.assertEqual(len(mail.outbox), 1)
		self.assertIn('new-dashboard@example.com', mail.outbox[0].to)

	def test_profile_dashboard_includes_favorite_businesses(self):
		FavoriteBusiness.objects.create(
			user=self.user,
			listing_slug='favorite-tacos-ventura',
			name='Favorite Tacos',
			city=City.VENTURA,
			city_label='Ventura',
			venue_type=VenueType.RESTAURANT,
			venue_type_label='Restaurant',
			address_line_1='123 Main St',
			website_url='https://example.com/favorite-tacos',
		)

		response = self.client.get(reverse('profile-dashboard'), {'portal': 'customer'}, **self.auth_headers())

		self.assertEqual(response.status_code, 200)
		self.assertEqual(len(response.data['favorite_businesses']), 1)
		self.assertEqual(response.data['favorite_businesses'][0]['slug'], 'favorite-tacos-ventura')

	def test_profile_contact_support_sends_email_with_account_context(self):
		response = self.client.post(
			reverse('profile-contact-support'),
			{
				'portal': 'customer',
				'subject': 'Map issue',
				'message': 'The business pin is missing from my map view.',
			},
			format='json',
			**self.auth_headers(),
		)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data['detail'], 'Your message has been sent to DiningDealz support.')
		self.assertEqual(len(mail.outbox), 1)
		self.assertIn('DiningDealz support: Map issue', mail.outbox[0].subject)
		self.assertIn('Name: Dash Board', mail.outbox[0].body)
		self.assertIn('Username: dashboard_user', mail.outbox[0].body)
		self.assertIn('Email: dashboard@example.com', mail.outbox[0].body)
		self.assertIn('Account type: Customer', mail.outbox[0].body)
		self.assertIn('The business pin is missing from my map view.', mail.outbox[0].body)

	def test_profile_contact_support_requires_authentication(self):
		response = self.client.post(
			reverse('profile-contact-support'),
			{
				'subject': 'Map issue',
				'message': 'Help.',
			},
			format='json',
		)

		self.assertEqual(response.status_code, 403)

	@patch('places.views.get_source_place_payload')
	def test_profile_favorites_endpoint_adds_favorite_business(self, mock_get_source_place_payload):
		mock_get_source_place_payload.return_value = self.favorite_place_payload

		response = self.client.post(
			reverse('profile-favorites'),
			{'slug': 'favorite-tacos-ventura', 'favorited': True, 'portal': 'customer'},
			format='json',
			**self.auth_headers(),
		)

		self.assertEqual(response.status_code, 200)
		self.assertTrue(FavoriteBusiness.objects.filter(user=self.user, listing_slug='favorite-tacos-ventura').exists())
		self.assertEqual(response.data['detail'], 'Business favorited.')
		self.assertEqual(len(response.data['favorite_businesses']), 1)

	def test_profile_favorites_endpoint_rejects_business_portal(self):
		snapshot = ListingSnapshot.objects.create(
			name='Approved Spot',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='55 Main St',
		)
		claim = BusinessClaim.objects.create(
			claimant=self.user,
			listing_snapshot=snapshot,
			contact_name='Dash Board',
			job_title='Owner',
			work_email='owner@approvedspot.com',
			work_phone='805-555-0200',
			employer_address='55 Main St, Ventura, CA 93001',
			verification_summary='I own the business.',
			status=BusinessClaim.Status.APPROVED,
		)
		BusinessMembership.objects.create(claim=claim, user=self.user, is_active=True)

		response = self.client.post(
			reverse('profile-favorites'),
			{'slug': 'favorite-tacos-ventura', 'favorited': True, 'portal': 'business'},
			format='json',
			**self.auth_headers(),
		)

		self.assertEqual(response.status_code, 403)
		self.assertEqual(response.data['detail'], 'Only customer accounts can favorite businesses.')
		self.assertFalse(FavoriteBusiness.objects.filter(user=self.user, listing_slug='favorite-tacos-ventura').exists())

	@patch('places.views.get_source_place_payload')
	def test_profile_favorites_endpoint_removes_favorite_business(self, mock_get_source_place_payload):
		mock_get_source_place_payload.return_value = self.favorite_place_payload
		FavoriteBusiness.objects.create(
			user=self.user,
			listing_slug='favorite-tacos-ventura',
			name='Favorite Tacos',
			city=City.VENTURA,
			city_label='Ventura',
			venue_type=VenueType.RESTAURANT,
			venue_type_label='Restaurant',
			address_line_1='123 Main St',
			website_url='https://example.com/favorite-tacos',
		)

		response = self.client.post(
			reverse('profile-favorites'),
			{'slug': 'favorite-tacos-ventura', 'favorited': False, 'portal': 'customer'},
			format='json',
			**self.auth_headers(),
		)

		self.assertEqual(response.status_code, 200)
		self.assertFalse(FavoriteBusiness.objects.filter(user=self.user, listing_slug='favorite-tacos-ventura').exists())
		self.assertEqual(response.data['detail'], 'Business removed from favorites.')

	def test_profile_dashboard_reverts_unverified_email_change_after_24_hours(self):
		self.profile.email_verified_at = timezone.now()
		self.profile.save(update_fields=['email_verified_at', 'updated_at'])

		change_response = self.client.post(
			reverse('profile-dashboard'),
			{
				'portal': 'customer',
				'username': 'dashboard_user',
				'email': 'new-dashboard@example.com',
				'first_name': 'Dash',
				'last_name': 'Board',
			},
			format='json',
			**self.auth_headers(),
		)

		self.assertEqual(change_response.status_code, 200)
		self.profile.refresh_from_db()
		self.profile.email_change_requested_at = timezone.now() - timedelta(hours=25)
		self.profile.save(update_fields=['email_change_requested_at', 'updated_at'])
		mail.outbox.clear()

		response = self.client.get(reverse('profile-dashboard'), {'portal': 'customer'}, **self.auth_headers())

		self.assertEqual(response.status_code, 200)
		self.user.refresh_from_db()
		self.profile.refresh_from_db()
		self.assertEqual(self.user.email, 'dashboard@example.com')
		self.assertTrue(self.profile.email_is_verified)
		self.assertEqual(self.profile.pending_email, '')
		self.assertEqual(self.profile.previous_verified_email, '')
		self.assertEqual(len(mail.outbox), 1)
		self.assertIn('new-dashboard@example.com', mail.outbox[0].body)
		self.assertIn('dashboard@example.com', mail.outbox[0].to)

	def test_profile_dashboard_verify_new_email_clears_pending_email_change(self):
		self.profile.email_verified_at = timezone.now()
		self.profile.save(update_fields=['email_verified_at', 'updated_at'])

		change_response = self.client.post(
			reverse('profile-dashboard'),
			{
				'portal': 'customer',
				'username': 'dashboard_user',
				'email': 'new-dashboard@example.com',
				'first_name': 'Dash',
				'last_name': 'Board',
			},
			format='json',
			**self.auth_headers(),
		)

		self.assertEqual(change_response.status_code, 200)
		self.profile.refresh_from_db()

		response = self.client.post(
			reverse('profile-verify-email-code'),
			{
				'username': self.user.username,
				'portal': 'customer',
				'code': self.profile.email_verification_code,
			},
			format='json',
		)

		self.assertEqual(response.status_code, 200)
		self.profile.refresh_from_db()
		self.assertEqual(self.profile.pending_email, '')
		self.assertEqual(self.profile.previous_verified_email, '')
		self.assertIsNone(self.profile.email_change_requested_at)

	def test_business_location_update_updates_mobile_snapshot(self):
		snapshot = ListingSnapshot.objects.create(
			name='Scoops Truck',
			city=City.VENTURA,
			venue_type=VenueType.MOBILE,
			address_line_1='Approximate live location',
		)
		claim = BusinessClaim.objects.create(
			claimant=self.user,
			listing_snapshot=snapshot,
			contact_name='Dash Board',
			job_title='Owner',
			work_email='owner@scoops.example.com',
			employer_address='',
			verification_summary='I operate the truck.',
			status=BusinessClaim.Status.APPROVED,
		)
		BusinessMembership.objects.create(claim=claim, user=self.user, is_active=True)

		response = self.client.post(
			reverse('profile-business-location'),
			{'latitude': 34.2812, 'longitude': -119.2944, 'accuracy_meters': 35.5},
			format='json',
			**self.auth_headers(),
		)

		self.assertEqual(response.status_code, 200)
		snapshot.refresh_from_db()
		self.assertEqual(snapshot.tracked_location_latitude, 34.2812)
		self.assertEqual(snapshot.tracked_location_longitude, -119.2944)
		self.assertEqual(snapshot.tracked_location_accuracy_meters, 35.5)
		self.assertTrue(response.data['requires_business_location_tracking'])

	def test_business_location_update_rejects_when_tracking_is_disabled(self):
		self.profile.business_location_tracking_enabled = False
		self.profile.save(update_fields=['business_location_tracking_enabled', 'updated_at'])
		snapshot = ListingSnapshot.objects.create(
			name='Scoops Truck',
			city=City.VENTURA,
			venue_type=VenueType.MOBILE,
			address_line_1='Approximate live location',
		)
		claim = BusinessClaim.objects.create(
			claimant=self.user,
			listing_snapshot=snapshot,
			contact_name='Dash Board',
			job_title='Owner',
			work_email='owner@scoops.example.com',
			employer_address='',
			verification_summary='I operate the truck.',
			status=BusinessClaim.Status.APPROVED,
		)
		BusinessMembership.objects.create(claim=claim, user=self.user, is_active=True)

		response = self.client.post(
			reverse('profile-business-location'),
			{'latitude': 34.2812, 'longitude': -119.2944, 'accuracy_meters': 35.5},
			format='json',
			**self.auth_headers(),
		)

		self.assertEqual(response.status_code, 400)
		self.assertEqual(response.data['detail'], 'Turn on location services in settings before sending live business location updates.')

	def test_business_location_preference_view_updates_tracking_preference(self):
		snapshot = ListingSnapshot.objects.create(
			name='Scoops Truck',
			city=City.VENTURA,
			venue_type=VenueType.MOBILE,
			address_line_1='Approximate live location',
			tracked_location_latitude=34.2812,
			tracked_location_longitude=-119.2944,
			tracked_location_accuracy_meters=35.5,
			tracked_location_updated_at=timezone.now(),
		)
		claim = BusinessClaim.objects.create(
			claimant=self.user,
			listing_snapshot=snapshot,
			contact_name='Dash Board',
			job_title='Owner',
			work_email='owner@scoops.example.com',
			employer_address='',
			verification_summary='I operate the truck.',
			status=BusinessClaim.Status.APPROVED,
		)
		BusinessMembership.objects.create(claim=claim, user=self.user, is_active=True)

		response = self.client.post(
			reverse('profile-business-location-preference'),
			{'enabled': False},
			format='json',
			**self.auth_headers(),
		)

		self.assertEqual(response.status_code, 200)
		self.profile.refresh_from_db()
		snapshot.refresh_from_db()
		self.assertFalse(self.profile.business_location_tracking_enabled)
		self.assertIsNone(snapshot.tracked_location_latitude)
		self.assertIsNone(snapshot.tracked_location_longitude)
		self.assertIsNone(snapshot.tracked_location_accuracy_meters)
		self.assertIsNone(snapshot.tracked_location_updated_at)
		self.assertTrue(response.data['business_location_tracking_available'])
		self.assertFalse(response.data['business_location_tracking_enabled'])
		self.assertFalse(response.data['requires_business_location_tracking'])

		payload = get_source_place_payload(snapshot.listing_slug)
		self.assertIsNotNone(payload)
		self.assertIsNone(payload['latitude'])
		self.assertIsNone(payload['longitude'])
		self.assertIsNone(payload['locations'][0]['latitude'])
		self.assertIsNone(payload['locations'][0]['longitude'])

	def test_resend_verification_email_sends_message(self):
		response = self.client.post(reverse('profile-resend-verification'), {}, format='json', **self.auth_headers())

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data['detail'], 'Verification email sent.')
		self.profile.refresh_from_db()
		self.assertIsNotNone(self.profile.email_verification_sent_at)
		self.assertEqual(len(mail.outbox), 1)
		self.assertIn('DiningDealz', mail.outbox[0].from_email)
		self.assertIn(self.profile.email_verification_token, mail.outbox[0].body)
		self.assertIn('text/html', mail.outbox[0].alternatives[0][1])

	def test_recover_username_sends_message(self):
		response = self.client.post(
			reverse('profile-recover-username'),
			{'email': self.user.email},
			format='json',
		)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data['detail'], 'If that email address is registered, a username reminder has been sent.')
		self.assertEqual(len(mail.outbox), 1)
		self.assertIn(self.user.username, mail.outbox[0].body)

	def test_password_reset_request_and_confirm_updates_password(self):
		request_response = self.client.post(
			reverse('profile-password-reset-request'),
			{'identifier': self.user.username},
			format='json',
		)

		self.assertEqual(request_response.status_code, 200)
		self.profile.refresh_from_db()
		self.assertTrue(self.profile.password_reset_token)
		self.assertEqual(len(mail.outbox), 1)
		self.assertIn(self.profile.password_reset_token, mail.outbox[0].body)

		confirm_response = self.client.post(
			reverse('profile-password-reset', kwargs={'token': self.profile.password_reset_token}),
			{'new_password': 'new-test-pass-123'},
		)

		self.assertEqual(confirm_response.status_code, 200)
		self.user.refresh_from_db()
		self.profile.refresh_from_db()
		self.assertTrue(self.user.check_password('new-test-pass-123'))
		self.assertEqual(self.profile.password_reset_token, '')
		self.assertEqual(self.user.profile_auth_tokens.count(), 0)

	def test_delete_account_removes_user_and_related_profile_records(self):
		FavoriteBusiness.objects.create(
			user=self.user,
			listing_slug='805-tacos-ventura',
			name='805 Tacos',
			city=City.VENTURA,
			city_label='Ventura',
			venue_type=VenueType.RESTAURANT,
			venue_type_label='Restaurant',
			address_line_1='123 Main St',
			website_url='https://example.com/805-tacos',
		)

		response = self.client.post(
			reverse('profile-delete-account'),
			{'password': 'test-pass-123'},
			format='json',
			**self.auth_headers(),
		)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.data['detail'], 'Account permanently deleted.')
		self.assertFalse(User.objects.filter(pk=self.user.pk).exists())
		self.assertFalse(AccountProfile.objects.filter(pk=self.profile.pk).exists())
		self.assertEqual(ProfileAuthToken.objects.filter(user_id=self.user.pk).count(), 0)
		self.assertEqual(FavoriteBusiness.objects.filter(user_id=self.user.pk).count(), 0)

	def test_delete_account_rejects_incorrect_password(self):
		response = self.client.post(
			reverse('profile-delete-account'),
			{'password': 'wrong-pass'},
			format='json',
			**self.auth_headers(),
		)

		self.assertEqual(response.status_code, 400)
		self.assertEqual(response.data['password'][0], 'Incorrect password.')
		self.assertTrue(User.objects.filter(pk=self.user.pk).exists())

	def test_two_factor_setup_confirm_and_disable_round_trip(self):
		setup_response = self.client.post(reverse('profile-toggle-two-factor'), {}, format='json', **self.auth_headers())

		self.assertEqual(setup_response.status_code, 200)
		self.assertIn('manual_entry_key', setup_response.data)
		self.profile.refresh_from_db()
		self.assertEqual(self.profile.two_factor_pending_secret, setup_response.data['manual_entry_key'])

		confirm_response = self.client.post(
			reverse('profile-confirm-two-factor'),
			{'code': pyotp.TOTP(setup_response.data['manual_entry_key']).now(), 'portal': 'customer'},
			format='json',
			**self.auth_headers(),
		)

		self.assertEqual(confirm_response.status_code, 200)
		self.assertTrue(confirm_response.data['two_factor_enabled'])
		self.profile.refresh_from_db()
		self.assertTrue(self.profile.two_factor_enabled)
		self.assertTrue(self.profile.two_factor_secret)

		disable_response = self.client.post(
			reverse('profile-disable-two-factor'),
			{'code': pyotp.TOTP(self.profile.two_factor_secret).now(), 'portal': 'customer'},
			format='json',
			**self.auth_headers(),
		)

		self.assertEqual(disable_response.status_code, 200)
		self.assertFalse(disable_response.data['two_factor_enabled'])
		self.profile.refresh_from_db()
		self.assertFalse(self.profile.two_factor_enabled)
		self.assertEqual(self.profile.two_factor_secret, '')

	@override_settings(PROFILE_EMAIL_VERIFICATION_SUCCESS_URL='')
	def test_verify_email_marks_profile_as_verified(self):
		token = self.profile.ensure_verification_token(force=True)
		self.profile.save(update_fields=['email_verification_token', 'updated_at'])

		response = self.client.get(reverse('profile-verify-email', kwargs={'token': token}))

		self.assertEqual(response.status_code, 200)
		self.profile.refresh_from_db()
		self.assertTrue(self.profile.email_is_verified)
		self.assertEqual(self.profile.email_verification_token, '')

	@override_settings(PROFILE_EMAIL_VERIFICATION_SUCCESS_URL='happyhourapp://verified')
	def test_verify_email_redirects_when_success_url_is_configured(self):
		token = self.profile.ensure_verification_token(force=True)
		self.profile.save(update_fields=['email_verification_token', 'updated_at'])

		response = self.client.get(reverse('profile-verify-email', kwargs={'token': token}))

		self.assertEqual(response.status_code, 302)
		self.assertEqual(response['Location'], 'happyhourapp://verified')

	@override_settings(PROFILE_EMAIL_VERIFICATION_FAILURE_URL='happyhourapp://verification-error')
	def test_verify_email_redirects_when_failure_url_is_configured(self):
		response = self.client.get(reverse('profile-verify-email', kwargs={'token': 'missing-token'}))

		self.assertEqual(response.status_code, 302)
		self.assertEqual(response['Location'], 'happyhourapp://verification-error')


class AccountProxyTests(APITestCase):
	def setUp(self):
		super().setUp()
		self.admin_user = User.objects.create_superuser(username='account_proxy_admin', email='account_proxy_admin@example.com', password='test-pass-123')

	def test_customer_and_business_account_proxies_split_non_staff_users(self):
		customer = User.objects.create_user(username='regular_customer', email='customer@example.com', password='test-pass-123')
		business_user = User.objects.create_user(username='business_owner', email='owner@example.com', password='test-pass-123')
		snapshot = ListingSnapshot.objects.create(
			name='805 Coffee',
			city=City.VENTURA,
			venue_type=VenueType.CAFE,
			address_line_1='22 Palm St',
		)
		BusinessClaim.objects.create(
			claimant=business_user,
			listing_snapshot=snapshot,
			contact_name='Owner Name',
			job_title='Owner',
			work_email='owner@805coffee.com',
			verification_summary='I own the business.',
			status=BusinessClaim.Status.SUBMITTED,
		)

		self.assertEqual(
			list(CustomerAccount.objects.order_by('username').values_list('username', flat=True)),
			['regular_customer'],
		)
		self.assertEqual(list(BusinessAccount.objects.values_list('username', flat=True)), [])

	def test_business_account_admin_status_summaries(self):
		approved_user = User.objects.create_user(username='approved_owner', email='approved@example.com', password='test-pass-123')
		snapshot = ListingSnapshot.objects.create(
			name='The Local Spot',
			listing_slug='the-local-spot',
			city=City.CAMARILLO,
			venue_type=VenueType.RESTAURANT,
			address_line_1='42 Mission Dr',
		)
		approved_claim = BusinessClaim.objects.create(
			claimant=approved_user,
			listing_snapshot=snapshot,
			contact_name='Approved Person',
			job_title='Owner',
			work_email='approved@localspot.com',
			work_phone='805-555-2222',
			employer_address='77 Owner Ln, Camarillo, CA 93010',
			business_website_url='https://owner.example.com/local-spot',
			deal_overrides=[{
				'title': 'Owner Taco Tuesday',
				'description': '$2 tacos',
				'deal_type': DealType.DAILY_SPECIAL,
				'price_text': '$2',
				'terms': '',
				'happy_hours': [],
			}],
			operating_hour_overrides=[{'weekday': Weekday.FRIDAY, 'open_time': '15:00', 'close_time': '22:00'}],
			supporting_details='Owner corrected the public contact info.',
			verification_summary='Approved verification.',
			status=BusinessClaim.Status.APPROVED,
		)
		BusinessMembership.objects.create(
			user=approved_user,
			claim=approved_claim,
			is_active=True,
		)

		admin_instance = BusinessAccountAdmin(BusinessAccount, AdminSite())
		approved_account = BusinessAccount.objects.get(username='approved_owner')

		self.assertEqual(admin_instance.business_status(approved_account), 'Approved business')
		self.assertEqual(admin_instance.membership_status(approved_account), 'Active membership')
		self.assertEqual(admin_instance.managed_business_public_phone(approved_account), '805-555-2222')
		self.assertIn('77 Owner Ln', admin_instance.managed_business_public_address(approved_account))
		self.assertIn('owner.example.com/local-spot', str(admin_instance.managed_business_public_website(approved_account)))
		self.assertIn('Owner Taco Tuesday', str(admin_instance.managed_business_public_deals_preview(approved_account)))
		self.assertIn('Friday: 15:00 - 22:00', str(admin_instance.managed_business_public_hours_preview(approved_account)))
		self.assertEqual(admin_instance.managed_business_supporting_details(approved_account), 'Owner corrected the public contact info.')

	def test_business_account_change_page_shows_managed_business_profile_details(self):
		approved_user = User.objects.create_user(username='profile_owner', email='profile_owner@example.com', password='test-pass-123')
		snapshot = ListingSnapshot.objects.create(
			name='Yard House',
			listing_slug='yard-house-admin-profile',
			city=City.OXNARD,
			venue_type=VenueType.BAR,
			address_line_1='501 Collection Blvd Ste # 4130',
		)
		approved_claim = BusinessClaim.objects.create(
			claimant=approved_user,
			listing_snapshot=snapshot,
			contact_name='Profile Owner',
			job_title='Owner',
			work_email='owner@yardhouse.com',
			work_phone='805-555-0211',
			employer_address='777 Owner Way, Oxnard, CA 93036',
			business_website_url='https://owner.example.com/yard-house',
			supporting_details='Updated from approved owner dashboard.',
			verification_summary='Approved verification.',
			status=BusinessClaim.Status.APPROVED,
		)
		BusinessMembership.objects.create(user=approved_user, claim=approved_claim, is_active=True)
		self.client.force_login(self.admin_user)

		response = self.client.get(reverse('happyhour_admin:places_businessaccount_change', args=[approved_user.pk]))

		self.assertEqual(response.status_code, 200)
		self.assertContains(response, 'Managed business profile')
		self.assertContains(response, '777 Owner Way')
		self.assertContains(response, '805-555-0211')
		self.assertContains(response, 'https://owner.example.com/yard-house')
		self.assertContains(response, 'Updated from approved owner dashboard.')

	def test_customer_account_admin_excludes_business_applicants(self):
		business_user = User.objects.create_user(username='claiming_customer', email='claiming@example.com', password='test-pass-123')
		regular_customer = User.objects.create_user(username='true_customer', email='true_customer@example.com', password='test-pass-123')
		snapshot = ListingSnapshot.objects.create(
			name='Claimed Place',
			city=City.OXNARD,
			venue_type=VenueType.RESTAURANT,
			address_line_1='100 Harbor Blvd',
		)
		BusinessClaim.objects.create(
			claimant=business_user,
			listing_snapshot=snapshot,
			contact_name='Claiming User',
			job_title='Manager',
			work_email='claiming@claimedplace.com',
			verification_summary='Please review my claim.',
			status=BusinessClaim.Status.SUBMITTED,
		)

		admin_instance = CustomerAccountAdmin(CustomerAccount, AdminSite())
		queryset = admin_instance.get_queryset(self.client.request().wsgi_request)

		self.assertEqual(list(queryset.values_list('username', flat=True)), ['true_customer'])

	def test_customer_account_delete_confirmation_shows_warning_and_scrollable_list(self):
		customer = User.objects.create_user(username='delete_customer', email='delete_customer@example.com', password='test-pass-123')
		self.client.force_login(self.admin_user)

		response = self.client.get(reverse('happyhour_admin:places_customeraccount_delete', args=[customer.pk]))

		self.assertEqual(response.status_code, 200)
		self.assertContains(response, 'Are you sure you want to delete this customer account?')
		self.assertContains(response, 'Review the account details below before permanently deleting it.')
		self.assertContains(response, 'account-delete-warning__list')
		self.assertContains(response, customer.username)
		self.assertContains(response, customer.email)

	def test_customer_account_bulk_delete_confirmation_lists_selected_accounts(self):
		first_customer = User.objects.create_user(username='bulk_customer_one', email='bulk_customer_one@example.com', password='test-pass-123')
		second_customer = User.objects.create_user(username='bulk_customer_two', email='bulk_customer_two@example.com', password='test-pass-123')
		self.client.force_login(self.admin_user)

		response = self.client.post(
			reverse('happyhour_admin:places_customeraccount_changelist'),
			{
				'action': 'delete_selected',
				helpers.ACTION_CHECKBOX_NAME: [str(first_customer.pk), str(second_customer.pk)],
				'index': '0',
			},
		)

		self.assertEqual(response.status_code, 200)
		self.assertContains(response, 'Are you sure you want to delete these customer accounts?')
		self.assertContains(response, 'Review the selected accounts below before permanently deleting them.')
		self.assertContains(response, 'account-delete-warning__list')
		self.assertContains(response, first_customer.username)
		self.assertContains(response, second_customer.username)
		self.assertContains(response, first_customer.email)
		self.assertContains(response, second_customer.email)

	def test_business_account_delete_confirmation_shows_warning_and_scrollable_list(self):
		approved_user = User.objects.create_user(username='delete_business_owner', email='delete_business_owner@example.com', password='test-pass-123')
		snapshot = ListingSnapshot.objects.create(
			name='Delete Business Cafe',
			city=City.VENTURA,
			venue_type=VenueType.CAFE,
			address_line_1='22 Palm St',
		)
		approved_claim = BusinessClaim.objects.create(
			claimant=approved_user,
			listing_snapshot=snapshot,
			contact_name='Delete Owner',
			job_title='Owner',
			work_email='owner@deletebusiness.com',
			verification_summary='Approved verification.',
			status=BusinessClaim.Status.APPROVED,
		)
		BusinessMembership.objects.create(user=approved_user, claim=approved_claim, is_active=True)
		self.client.force_login(self.admin_user)

		response = self.client.get(reverse('happyhour_admin:places_businessaccount_delete', args=[approved_user.pk]))

		self.assertEqual(response.status_code, 200)
		self.assertContains(response, 'Are you sure you want to delete this business account?')
		self.assertContains(response, 'Review the account details below before permanently deleting it.')
		self.assertContains(response, 'account-delete-warning__list')
		self.assertContains(response, approved_user.username)
		self.assertContains(response, approved_user.email)
		self.assertContains(response, snapshot.name)

	def test_business_account_bulk_delete_confirmation_lists_selected_accounts(self):
		first_user = User.objects.create_user(username='bulk_business_one', email='bulk_business_one@example.com', password='test-pass-123')
		second_user = User.objects.create_user(username='bulk_business_two', email='bulk_business_two@example.com', password='test-pass-123')
		first_snapshot = ListingSnapshot.objects.create(
			name='Bulk Business One',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='100 Main St',
		)
		second_snapshot = ListingSnapshot.objects.create(
			name='Bulk Business Two',
			city=City.OXNARD,
			venue_type=VenueType.CAFE,
			address_line_1='200 Harbor Blvd',
		)
		first_claim = BusinessClaim.objects.create(
			claimant=first_user,
			listing_snapshot=first_snapshot,
			contact_name='First Bulk Owner',
			job_title='Owner',
			work_email='first@bulkbusiness.com',
			verification_summary='Approved verification.',
			status=BusinessClaim.Status.APPROVED,
		)
		second_claim = BusinessClaim.objects.create(
			claimant=second_user,
			listing_snapshot=second_snapshot,
			contact_name='Second Bulk Owner',
			job_title='Owner',
			work_email='second@bulkbusiness.com',
			verification_summary='Approved verification.',
			status=BusinessClaim.Status.APPROVED,
		)
		BusinessMembership.objects.create(user=first_user, claim=first_claim, is_active=True)
		BusinessMembership.objects.create(user=second_user, claim=second_claim, is_active=True)
		self.client.force_login(self.admin_user)

		response = self.client.post(
			reverse('happyhour_admin:places_businessaccount_changelist'),
			{
				'action': 'delete_selected',
				helpers.ACTION_CHECKBOX_NAME: [str(first_user.pk), str(second_user.pk)],
				'index': '0',
			},
		)

		self.assertEqual(response.status_code, 200)
		self.assertContains(response, 'Are you sure you want to delete these business accounts?')
		self.assertContains(response, 'Review the selected accounts below before permanently deleting them.')
		self.assertContains(response, 'account-delete-warning__list')
		self.assertContains(response, first_user.username)
		self.assertContains(response, second_user.username)
		self.assertContains(response, first_snapshot.name)
		self.assertContains(response, second_snapshot.name)


class ListingSnapshotAdminTests(TestCase):
	def setUp(self):
		self.site = AdminSite()
		self.admin = ListingSnapshotAdmin(ListingSnapshot, self.site)
		self.deleted_admin = DeletedBusinessAdmin(DeletedBusiness, self.site)
		self.request_factory = RequestFactory()
		self.admin_user = User.objects.create_superuser(username='snapshot_admin', email='snapshot_admin@example.com', password='test-pass-123')

	def _build_request(self, path='/admin/'):
		request = self.request_factory.get(path)
		request.user = self.admin_user
		setattr(request, 'session', {})
		setattr(request, '_messages', FallbackStorage(request))
		return request

	def test_listing_snapshot_admin_form_accepts_plain_text_deal_override(self):
		form = ListingSnapshotAdminForm(data={
			'name': '999 Pizza',
			'listing_slug': '999-pizza',
			'source_name': 'here_places',
			'source_url': '',
			'external_id': 'here:999-pizza',
			'city': City.CAMARILLO,
			'venue_type': VenueType.RESTAURANT,
			'address_line_1': 'Ventura Blvd',
			'address_line_2': '',
			'neighborhood': '',
			'state': 'CA',
			'postal_code': '93010',
			'phone_number': '',
			'website_url': '',
			'deal_overrides': 'Large 14" Pizza with Two Free Toppings!\n$23.76\nAdd toppings to your taste!',
			'operating_hour_overrides': '',
			'tracked_location_latitude': '',
			'tracked_location_longitude': '',
			'tracked_location_accuracy_meters': '',
			'tracked_location_updated_at': '',
		})

		self.assertTrue(form.is_valid(), form.errors.as_json())
		self.assertEqual(
			form.cleaned_data['deal_overrides'],
			[{
				'title': 'Large 14" Pizza with Two Free Toppings!',
				'description': 'Add toppings to your taste!',
				'deal_type': DealType.OTHER.value,
				'custom_deal_type_label': '',
				'price_text': '$23.76',
				'terms': '',
				'happy_hours': [],
			}],
		)

	def test_listing_snapshot_admin_form_accepts_multiple_plain_text_deals_with_happy_hours(self):
		form = ListingSnapshotAdminForm(data={
			'name': '999 Pizza',
			'listing_slug': '999-pizza',
			'source_name': 'here_places',
			'source_url': '',
			'external_id': 'here:999-pizza',
			'city': City.CAMARILLO,
			'venue_type': VenueType.RESTAURANT,
			'address_line_1': 'Ventura Blvd',
			'address_line_2': '',
			'neighborhood': '',
			'state': 'CA',
			'postal_code': '93010',
			'phone_number': '',
			'website_url': '',
			'deal_overrides': (
				'Title: Large 14" Pizza with Two Free Toppings!\n'
				'Type: Daily Special\n'
				'Price: $23.76\n'
				'Description: Add toppings to your taste!\n\n'
				'Title: Weekday Happy Hour Slice Combo\n'
				'Type: Happy Hour\n'
				'Price: $9.99\n'
				'Description: One slice and a drink.\n'
				'Happy hour: Monday 3:00 PM - 6:00 PM\n'
				'Happy hour: Tuesday all day'
			),
			'operating_hour_overrides': '',
			'tracked_location_latitude': '',
			'tracked_location_longitude': '',
			'tracked_location_accuracy_meters': '',
			'tracked_location_updated_at': '',
		})

		self.assertTrue(form.is_valid(), form.errors.as_json())
		self.assertEqual(len(form.cleaned_data['deal_overrides']), 2)
		self.assertEqual(form.cleaned_data['deal_overrides'][0]['deal_type'], DealType.DAILY_SPECIAL)
		self.assertEqual(form.cleaned_data['deal_overrides'][1]['deal_type'], DealType.HAPPY_HOUR)
		self.assertEqual(len(form.cleaned_data['deal_overrides'][1]['happy_hours']), 2)
		self.assertEqual(form.cleaned_data['deal_overrides'][1]['happy_hours'][0]['weekday'], Weekday.MONDAY)
		self.assertEqual(form.cleaned_data['deal_overrides'][1]['happy_hours'][0]['start_time'], '15:00')
		self.assertEqual(form.cleaned_data['deal_overrides'][1]['happy_hours'][1]['weekday'], Weekday.TUESDAY)
		self.assertTrue(form.cleaned_data['deal_overrides'][1]['happy_hours'][1]['all_day'])

	def test_listing_snapshot_admin_form_moves_facebook_urls_out_of_website_and_source_fields(self):
		form = ListingSnapshotAdminForm(data={
			'name': 'Cafe 805',
			'listing_slug': 'cafe-805',
			'source_name': 'here_places',
			'source_url': 'https://facebook.com/cafe805',
			'external_id': 'here:cafe-805',
			'city': City.VENTURA,
			'venue_type': VenueType.CAFE,
			'address_line_1': '123 Main St',
			'address_line_2': '',
			'neighborhood': '',
			'state': 'CA',
			'postal_code': '93001',
			'phone_number': '',
			'website_url': 'https://facebook.com/cafe805',
			'instagram_url': '',
			'facebook_url': 'https://facebook.com/cafe805',
			'tiktok_url': '',
			'youtube_url': '',
			'deal_overrides': '',
			'operating_hour_overrides': '',
			'tracked_location_latitude': '',
			'tracked_location_longitude': '',
			'tracked_location_accuracy_meters': '',
			'tracked_location_updated_at': '',
		})

		self.assertTrue(form.is_valid(), form.errors.as_json())
		self.assertEqual(form.cleaned_data['website_url'], '')
		self.assertEqual(form.cleaned_data['source_url'], '')
		self.assertEqual(
			form.cleaned_data['social_profiles'],
			{
				'facebook': {
					'url': 'https://facebook.com/cafe805',
					'username': 'cafe805',
				},
			},
		)
		self.assertEqual(form.cleaned_data['social_media_links'], ['https://facebook.com/cafe805'])

	def test_listing_snapshot_admin_form_preserves_facebook_people_profile_paths(self):
		form = ListingSnapshotAdminForm(data={
			'name': 'Eggs Y Mas',
			'listing_slug': 'eggs-y-mas',
			'source_name': 'here_places',
			'source_url': '',
			'external_id': 'here:eggs-y-mas',
			'city': City.VENTURA,
			'venue_type': VenueType.RESTAURANT,
			'address_line_1': '123 Breakfast Ave',
			'address_line_2': '',
			'neighborhood': '',
			'state': 'CA',
			'postal_code': '93001',
			'phone_number': '',
			'website_url': '',
			'instagram_url': '',
			'facebook_url': 'https://facebook.com/people/Eggs-Y-Mas/61565561839458/',
			'tiktok_url': '',
			'youtube_url': '',
			'deal_overrides': '',
			'operating_hour_overrides': '',
			'tracked_location_latitude': '',
			'tracked_location_longitude': '',
			'tracked_location_accuracy_meters': '',
			'tracked_location_updated_at': '',
		})

		self.assertTrue(form.is_valid(), form.errors.as_json())
		self.assertEqual(
			form.cleaned_data['social_profiles']['facebook'],
			{
				'url': 'https://facebook.com/people/Eggs-Y-Mas/61565561839458',
				'username': 'people/Eggs-Y-Mas/61565561839458',
			},
		)
		self.assertEqual(
			form.cleaned_data['social_media_links'],
			['https://facebook.com/people/Eggs-Y-Mas/61565561839458'],
		)

	def test_listing_snapshot_admin_form_populates_platform_specific_social_fields_from_instance(self):
		snapshot = ListingSnapshot.objects.create(
			name='Eggs Y Mas',
			listing_slug='eggs-y-mas',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='401 Example St',
			social_profiles={
				'facebook': {
					'url': 'https://facebook.com/eggsymas',
					'username': 'eggsymas',
				},
				'instagram': {
					'url': 'https://instagram.com/eggsymas',
					'username': 'eggsymas',
				},
			},
			social_media_links=['https://facebook.com/eggsymas', 'https://instagram.com/eggsymas'],
		)

		form = ListingSnapshotAdminForm(instance=snapshot)

		self.assertEqual(form.initial['facebook_url'], 'https://facebook.com/eggsymas')
		self.assertEqual(form.initial['instagram_url'], 'https://instagram.com/eggsymas')
		self.assertEqual(form.initial['tiktok_url'], '')
		self.assertEqual(form.initial['youtube_url'], '')

	def test_listing_snapshot_admin_form_save_persists_platform_specific_social_fields(self):
		snapshot = ListingSnapshot.objects.create(
			name='Eggs Y Mas',
			listing_slug='eggs-y-mas',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='401 Example St',
		)

		form = ListingSnapshotAdminForm(instance=snapshot, data={
			'name': 'Eggs Y Mas',
			'listing_slug': 'eggs-y-mas',
			'source_name': '',
			'source_url': '',
			'external_id': '',
			'city': City.VENTURA,
			'venue_type': VenueType.RESTAURANT,
			'address_line_1': '401 Example St',
			'address_line_2': '',
			'neighborhood': '',
			'state': 'CA',
			'postal_code': '',
			'phone_number': '',
			'website_url': '',
			'instagram_url': '',
			'facebook_url': 'https://facebook.com/eggsymas',
			'tiktok_url': '',
			'youtube_url': '',
			'deal_overrides': '',
			'operating_hour_overrides': '',
			'tracked_location_latitude': '',
			'tracked_location_longitude': '',
			'tracked_location_accuracy_meters': '',
			'tracked_location_updated_at': '',
		})

		self.assertTrue(form.is_valid(), form.errors.as_json())
		saved_snapshot = form.save()

		self.assertEqual(
			saved_snapshot.social_profiles,
			{
				'facebook': {
					'url': 'https://facebook.com/eggsymas',
					'username': 'eggsymas',
				},
			},
		)
		self.assertEqual(saved_snapshot.social_media_links, ['https://facebook.com/eggsymas'])

	def test_listing_snapshot_admin_form_removing_imported_images_suppresses_future_repulls(self):
		snapshot = ListingSnapshot.objects.create(
			name='Photo Spot',
			listing_slug='photo-spot',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
			source_name='here_places',
			external_id='here:photo-spot',
			imported_image_urls=[
				'https://images.example.com/keep.jpg',
				'https://images.example.com/remove.jpg',
			],
		)

		form = ListingSnapshotAdminForm(instance=snapshot, data={
			'name': 'Photo Spot',
			'listing_slug': 'photo-spot',
			'source_name': 'here_places',
			'source_url': '',
			'external_id': 'here:photo-spot',
			'city': City.VENTURA,
			'venue_type': VenueType.RESTAURANT,
			'address_line_1': '123 Main St',
			'address_line_2': '',
			'neighborhood': '',
			'state': 'CA',
			'postal_code': '',
			'phone_number': '',
			'website_url': '',
			'imported_image_urls': 'https://images.example.com/keep.jpg',
			'instagram_url': '',
			'facebook_url': '',
			'tiktok_url': '',
			'youtube_url': '',
			'deal_overrides': '',
			'operating_hour_overrides': '',
			'tracked_location_latitude': '',
			'tracked_location_longitude': '',
			'tracked_location_accuracy_meters': '',
			'tracked_location_updated_at': '',
		})

		self.assertTrue(form.is_valid(), form.errors.as_json())
		saved_snapshot = form.save()

		self.assertEqual(saved_snapshot.imported_image_urls, ['https://images.example.com/keep.jpg'])
		self.assertEqual(saved_snapshot.suppressed_imported_image_urls, ['https://images.example.com/remove.jpg'])

		_sync_listing_snapshot_from_imported_place(ImportedPlace(
			name='Photo Spot',
			profile_name='Photo Spot',
			profile_slug='photo-spot',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
			state='CA',
			postal_code='93001',
			image_urls=[
				'https://images.example.com/keep.jpg',
				'https://images.example.com/remove.jpg',
				'https://images.example.com/new.jpg',
			],
			external_id='here:photo-spot',
			source_name='here_places',
			source_url='https://here.example.com/photo-spot',
		), snapshot=snapshot)

		snapshot.refresh_from_db()

		self.assertEqual(
			snapshot.imported_image_urls,
			['https://images.example.com/keep.jpg', 'https://images.example.com/new.jpg'],
		)
		self.assertEqual(snapshot.suppressed_imported_image_urls, ['https://images.example.com/remove.jpg'])

	def test_listing_snapshot_admin_form_can_suppress_website_url(self):
		form = ListingSnapshotAdminForm(data={
			'name': 'No Website Cafe',
			'listing_slug': 'no-website-cafe',
			'source_name': 'here_places',
			'source_url': '',
			'external_id': 'here:no-website-cafe',
			'city': City.VENTURA,
			'venue_type': VenueType.CAFE,
			'address_line_1': '123 Main St',
			'address_line_2': '',
			'neighborhood': '',
			'state': 'CA',
			'postal_code': '93001',
			'phone_number': '',
			'website_url': '',
			'website_url_suppressed': 'on',
			'instagram_url': '',
			'facebook_url': '',
			'tiktok_url': '',
			'youtube_url': '',
			'deal_overrides': '',
			'operating_hour_overrides': '',
			'tracked_location_latitude': '',
			'tracked_location_longitude': '',
			'tracked_location_accuracy_meters': '',
			'tracked_location_updated_at': '',
		})

		self.assertTrue(form.is_valid(), form.errors.as_json())
		snapshot = form.save()

		self.assertEqual(snapshot.website_url, '')
		self.assertTrue(snapshot.website_url_suppressed)

	def test_admin_source_snapshot_auto_prefixes_external_id(self):
		snapshot = ListingSnapshot.objects.create(
			name='Admin Spot',
			city=City.VENTURA,
			venue_type=VenueType.CAFE,
			address_line_1='123 Main St',
			source_name=BusinessClaim.ADMIN_SOURCE_NAME,
			external_id='my-manual-id',
		)

		self.assertEqual(snapshot.external_id, 'admin-my-manual-id')

		snapshot_without_external_id = ListingSnapshot.objects.create(
			name='Admin Spot 2',
			city=City.OXNARD,
			venue_type=VenueType.CAFE,
			address_line_1='456 Harbor Blvd',
			source_name=BusinessClaim.ADMIN_SOURCE_NAME,
			external_id='',
		)

		self.assertTrue(snapshot_without_external_id.external_id.startswith('admin-'))

		snapshot_with_manual_prefix = ListingSnapshot.objects.create(
			name='Admin Spot 3',
			city=City.CAMARILLO,
			venue_type=VenueType.CAFE,
			address_line_1='789 Ventura Blvd',
			source_name=BusinessClaim.ADMIN_SOURCE_NAME,
			external_id='manual-camarillo-premium-outlets',
		)

		self.assertEqual(snapshot_with_manual_prefix.external_id, 'admin-camarillo-premium-outlets')

	def test_sync_listing_snapshot_does_not_refill_suppressed_website_url(self):
		snapshot = ListingSnapshot.objects.create(
			name='No Website Cafe',
			listing_slug='no-website-cafe',
			city=City.VENTURA,
			venue_type=VenueType.CAFE,
			address_line_1='123 Main St',
			source_name='here_places',
			external_id='here:no-website-cafe',
			website_url='',
			website_url_suppressed=True,
		)

		_sync_listing_snapshot_from_imported_place(ImportedPlace(
			name='No Website Cafe',
			profile_name='No Website Cafe',
			profile_slug='no-website-cafe',
			city=City.VENTURA,
			venue_type=VenueType.CAFE,
			address_line_1='123 Main St',
			state='CA',
			postal_code='93001',
			website_url='https://wrong.example.com',
			external_id='here:no-website-cafe',
			source_name='here_places',
			source_url='https://here.example.com/no-website-cafe',
		), snapshot=snapshot)

		snapshot.refresh_from_db()

		self.assertEqual(snapshot.website_url, '')
		self.assertTrue(snapshot.website_url_suppressed)

	def test_listing_snapshot_admin_form_accepts_custom_type_when_other_is_selected(self):
		form = ListingSnapshotAdminForm(data={
			'name': '999 Pizza',
			'listing_slug': '999-pizza',
			'source_name': 'here_places',
			'source_url': '',
			'external_id': 'here:999-pizza',
			'city': City.CAMARILLO,
			'venue_type': VenueType.RESTAURANT,
			'address_line_1': 'Ventura Blvd',
			'address_line_2': '',
			'neighborhood': '',
			'state': 'CA',
			'postal_code': '93010',
			'phone_number': '',
			'website_url': '',
			'deal_overrides': (
				'Title: Trivia Night Combo\n'
				'Type: Event Special\n'
				'Price: $35\n'
				'Description: Pizza, pitcher, and reserved seating.'
			),
			'operating_hour_overrides': '',
			'tracked_location_latitude': '',
			'tracked_location_longitude': '',
			'tracked_location_accuracy_meters': '',
			'tracked_location_updated_at': '',
		})

		self.assertTrue(form.is_valid(), form.errors.as_json())
		self.assertEqual(form.cleaned_data['deal_overrides'][0]['deal_type'], DealType.OTHER)
		self.assertEqual(form.cleaned_data['deal_overrides'][0]['custom_deal_type_label'], 'Event Special')

	def test_listing_snapshot_admin_form_formats_saved_deals_as_readable_blocks(self):
		snapshot = ListingSnapshot.objects.create(
			name='999 Pizza',
			listing_slug='999-pizza',
			city=City.CAMARILLO,
			venue_type=VenueType.RESTAURANT,
			address_line_1='Ventura Blvd',
			deal_overrides=[
				{
					'title': 'Large 14" Pizza with Two Free Toppings!',
					'description': 'Add toppings to your taste!',
					'deal_type': DealType.DAILY_SPECIAL,
					'price_text': '$23.76',
					'terms': '',
					'happy_hours': [],
				},
				{
					'title': 'Weekday Happy Hour Slice Combo',
					'description': 'One slice and a drink.',
					'deal_type': DealType.HAPPY_HOUR,
					'price_text': '$9.99',
					'terms': '',
					'happy_hours': [
						{'weekday': Weekday.MONDAY, 'start_time': '15:00', 'end_time': '18:00', 'all_day': False},
					],
				},
			],
		)

		form = ListingSnapshotAdminForm(instance=snapshot)
		deal_override_text = form.fields['deal_overrides'].initial

		self.assertIn('Title: Large 14" Pizza with Two Free Toppings!', deal_override_text)
		self.assertIn('Type: Daily Special', deal_override_text)
		self.assertIn('Title: Weekday Happy Hour Slice Combo', deal_override_text)
		self.assertIn('Happy hour: Monday 3:00 PM - 6:00 PM', deal_override_text)
		self.assertEqual(form.initial['deal_overrides'], deal_override_text)

	def test_listing_snapshot_admin_form_exposes_structured_editor_assets_and_markers(self):
		form = ListingSnapshotAdminForm()

		self.assertIn('places/admin/listingsnapshot_structured_overrides.js', str(form.media))
		self.assertIn('places/admin/listingsnapshot_structured_overrides.css', str(form.media))
		self.assertEqual(form.fields['imported_image_urls'].widget.attrs['data-image-gallery-editor'], 'imported-images')
		self.assertEqual(form.fields['deal_overrides'].widget.attrs['data-structured-editor'], 'deals')
		self.assertEqual(form.fields['operating_hour_overrides'].widget.attrs['data-structured-editor'], 'hours')

	def test_listing_snapshot_admin_form_marks_empty_touched_deal_override_as_explicit_clear(self):
		snapshot = ListingSnapshot.objects.create(
			name='La Cascada',
			listing_slug='la-cascada',
			city=City.CAMARILLO,
			venue_type=VenueType.RESTAURANT,
			address_line_1='435 Arneill Rd',
		)

		form = ListingSnapshotAdminForm(data={
			'source_name': '',
			'source_url': '',
			'external_id': '',
			'listing_slug': 'la-cascada',
			'name': 'La Cascada',
			'city': City.CAMARILLO,
			'venue_type': VenueType.RESTAURANT,
			'address_line_1': '435 Arneill Rd',
			'address_line_2': '',
			'neighborhood': '',
			'state': 'CA',
			'postal_code': '',
			'phone_number': '',
			'website_url': '',
			'website_url_suppressed': '',
			'deal_overrides': '',
			'deal_overrides_touched': '1',
			'operating_hour_overrides': '',
			'operating_hour_overrides_touched': '',
			'tracked_location_latitude': '',
			'tracked_location_longitude': '',
			'tracked_location_accuracy_meters': '',
			'tracked_location_updated_at': '',
		}, instance=snapshot)

		self.assertTrue(form.is_valid(), form.errors.as_json())
		self.assertEqual(form.cleaned_data['deal_overrides'], [])
		self.assertTrue(form.cleaned_data['deal_overrides_cleared'])

	def test_listing_snapshot_admin_form_accepts_open_24_hours_plain_text(self):
		form = ListingSnapshotAdminForm(data={
			'name': 'Night Owl Diner',
			'listing_slug': 'night-owl-diner',
			'source_name': 'here_places',
			'source_url': '',
			'external_id': 'here:night-owl-diner',
			'city': City.CAMARILLO,
			'venue_type': VenueType.RESTAURANT,
			'address_line_1': '100 Harbor Blvd',
			'address_line_2': '',
			'neighborhood': '',
			'state': 'CA',
			'postal_code': '93010',
			'phone_number': '',
			'website_url': '',
			'deal_overrides': '',
			'operating_hour_overrides': 'Saturday: Open 24 hours',
			'tracked_location_latitude': '',
			'tracked_location_longitude': '',
			'tracked_location_accuracy_meters': '',
			'tracked_location_updated_at': '',
		})

		self.assertTrue(form.is_valid(), form.errors.as_json())
		self.assertEqual(form.cleaned_data['operating_hour_overrides'], [{
			'weekday': Weekday.SATURDAY,
			'open_time': '00:00',
			'close_time': '23:59',
			'open_24_hours': True,
		}])

	@patch('places.admin.get_source_place_payload')
	def test_listing_snapshot_admin_form_seeds_structured_editors_from_current_public_payload_when_overrides_are_blank(self, mock_get_source_place_payload):
		mock_get_source_place_payload.return_value = {
			'deals': [
				{
					'title': 'Imported Happy Hour',
					'description': '$1.50 off drafts',
					'deal_type': DealType.HAPPY_HOUR,
					'deal_type_label': 'Happy Hour',
					'price_text': '$1.50 off',
					'terms': 'Dine-in only',
					'happy_hours': [
						{'weekday': Weekday.MONDAY, 'start_time': '21:00', 'end_time': '23:00', 'all_day': False},
					],
				},
			],
			'operating_hours': [
				{'weekday': Weekday.MONDAY, 'open_time': '11:00', 'close_time': '23:00', 'group_id': None, 'group_rank': None},
			],
		}
		snapshot = ListingSnapshot.objects.create(
			name='Institution Ale Co.',
			listing_slug='institution-ale-co',
			city=City.CAMARILLO,
			venue_type=VenueType.BAR,
			address_line_1='311 Leisure Village Dr',
		)

		form = ListingSnapshotAdminForm(instance=snapshot)

		self.assertEqual(form.initial['deal_overrides'], '')
		self.assertEqual(form.initial['operating_hour_overrides'], '')
		self.assertEqual(form.fields['deal_overrides'].widget.attrs['data-initial-source'], 'current-public')
		self.assertEqual(form.fields['operating_hour_overrides'].widget.attrs['data-initial-source'], 'current-public')
		self.assertEqual(
			json.loads(form.fields['deal_overrides'].widget.attrs['data-initial-json'])[0]['title'],
			'Imported Happy Hour',
		)
		self.assertEqual(
			json.loads(form.fields['operating_hour_overrides'].widget.attrs['data-initial-json'])[0]['open_time'],
			'11:00',
		)

	@patch('places.admin.get_source_place_payload')
	def test_current_public_previews_render_times_in_12_hour_format(self, mock_get_source_place_payload):
		mock_get_source_place_payload.return_value = {
			'deals': [
				{
					'title': 'Imported Happy Hour',
					'price_text': '$1.50 off',
					'terms': 'Dine-in only',
					'happy_hours': [
						{'weekday_label': 'Monday', 'start_time': '21:00', 'end_time': '23:00', 'all_day': False},
					],
				},
			],
			'operating_hours': [
				{'weekday_label': 'Monday', 'open_time': '11:00', 'close_time': '23:00'},
			],
		}
		snapshot = ListingSnapshot.objects.create(
			name='Institution Ale Co.',
			listing_slug='institution-ale-co',
			city=City.CAMARILLO,
			venue_type=VenueType.BAR,
			address_line_1='311 Leisure Village Dr',
		)

		deals_preview = str(self.admin.current_public_deals_preview(snapshot))
		hours_preview = str(self.admin.current_public_hours_preview(snapshot))

		self.assertIn('Monday: 9:00 PM - 11:00 PM', deals_preview)
		self.assertIn('Monday: 11:00 AM - 11:00 PM', hours_preview)

	@patch('places.admin.get_source_place_payload')
	def test_changelist_deal_counts_separate_public_deals_from_manual_overrides(self, mock_get_source_place_payload):
		mock_get_source_place_payload.return_value = {
			'deals': [
				{'title': 'Imported Happy Hour'},
				{'title': 'Late Night'},
			],
			'operating_hours': [],
		}
		snapshot = ListingSnapshot.objects.create(
			name='Institution Ale Co.',
			listing_slug='institution-ale-co',
			city=City.CAMARILLO,
			venue_type=VenueType.BAR,
			address_line_1='311 Leisure Village Dr',
			deal_overrides=[{'title': 'Manual Deal'}],
		)

		self.assertEqual(self.admin.current_public_deal_count(snapshot), 2)
		self.assertEqual(self.admin.manual_deal_override_count(snapshot), 1)

	@patch('places.admin.get_source_place_payloads')
	@patch('places.admin.get_source_place_payload')
	def test_changelist_view_batches_public_deal_counts(self, mock_get_source_place_payload, mock_get_source_place_payloads):
		mock_get_source_place_payloads.return_value = [
			{'slug': 'institution-ale-co', 'deals': [{'title': 'Imported Happy Hour'}, {'title': 'Late Night'}]},
		]
		snapshot = ListingSnapshot.objects.create(
			name='Institution Ale Co.',
			listing_slug='institution-ale-co',
			city=City.CAMARILLO,
			venue_type=VenueType.BAR,
			address_line_1='311 Leisure Village Dr',
		)

		with patch('django.contrib.admin.options.ModelAdmin.changelist_view', autospec=True) as mock_super_changelist_view:
			mock_super_changelist_view.side_effect = lambda _self, request, extra_context=None: self.admin.current_public_deal_count(snapshot)
			result = self.admin.changelist_view(self._build_request('/admin/places/listingsnapshot/'))

		self.assertEqual(result, 2)
		mock_get_source_place_payloads.assert_called_once_with(resolve_missing_coordinates=False)
		mock_get_source_place_payload.assert_not_called()

	@patch('places.admin.get_source_place_payloads')
	@patch('places.admin.get_source_place_payload')
	def test_changelist_view_keeps_batched_deal_counts_until_response_render(self, mock_get_source_place_payload, mock_get_source_place_payloads):
		from django.template import engines
		from django.template.response import SimpleTemplateResponse

		mock_get_source_place_payloads.return_value = [
			{'slug': 'institution-ale-co', 'deals': [{'title': 'Imported Happy Hour'}, {'title': 'Late Night'}]},
		]
		snapshot = ListingSnapshot.objects.create(
			name='Institution Ale Co.',
			listing_slug='institution-ale-co',
			city=City.CAMARILLO,
			venue_type=VenueType.BAR,
			address_line_1='311 Leisure Village Dr',
		)

		with patch('django.contrib.admin.options.ModelAdmin.changelist_view', autospec=True) as mock_super_changelist_view:
			def _fake_super(_self, request, extra_context=None):
				response = SimpleTemplateResponse(engines['django'].from_string('ok'))
				response.add_post_render_callback(lambda rendered_response: setattr(rendered_response, '_deal_count_during_render', self.admin.current_public_deal_count(snapshot)))
				return response

			mock_super_changelist_view.side_effect = _fake_super
			response = self.admin.changelist_view(self._build_request('/admin/places/listingsnapshot/'))
			self.assertIsNotNone(getattr(self.admin, '_changelist_public_deal_counts', None))
			response.render()

		self.assertEqual(response._deal_count_during_render, 2)
		self.assertIsNone(getattr(self.admin, '_changelist_public_deal_counts', None))
		mock_get_source_place_payload.assert_not_called()

	@patch('places.admin.get_source_place_payload')
	def test_current_public_hours_preview_renders_open_24_hours_label(self, mock_get_source_place_payload):
		mock_get_source_place_payload.return_value = {
			'deals': [],
			'operating_hours': [
				{'weekday_label': 'Monday', 'open_time': '00:00', 'close_time': '23:59', 'open_24_hours': True},
			],
		}
		snapshot = ListingSnapshot.objects.create(
			name='Institution Ale Co.',
			listing_slug='institution-ale-co',
			city=City.CAMARILLO,
			venue_type=VenueType.BAR,
			address_line_1='311 Leisure Village Dr',
		)

		hours_preview = str(self.admin.current_public_hours_preview(snapshot))

		self.assertIn('Monday: Open 24 hours', hours_preview)

	@override_settings(DISCOVERY_JSON_PATH='')
	def test_pull_business_data_view_delete_moves_to_deleted_businesses_and_restore_brings_it_back(self):
		with TemporaryDirectory() as temp_dir:
			json_path = Path(temp_dir) / 'discovered_places.json'
			snapshot = ListingSnapshot.objects.create(
				name='Cronies Sports Grill',
				city=City.VENTURA,
				venue_type=VenueType.BAR,
				address_line_1='2855 Johnson Dr',
				website_url='https://www.cronies.com/',
			)
			place_record = ImportedPlace(
				name='Cronies Sports Grill',
				city=City.VENTURA,
				venue_type=VenueType.BAR,
				address_line_1='2855 Johnson Dr',
				phone_number='(805) 650-6026',
				website_url='https://www.cronies.com/',
				external_id='here:cronies-ventura',
				source_name='here_places',
				source_url='https://discover.search.hereapi.com/v1/discover',
			)

			with override_settings(DISCOVERY_JSON_PATH=json_path), patch.object(HerePlacesImporter, 'load_records_for_search', return_value=[place_record]), patch.object(BusinessWebsiteImporter, 'enrich_place_record', return_value=place_record):
				response = self.admin.pull_business_data_view(self._build_request(f'/admin/places/listingsnapshot/{snapshot.pk}/pull-business-data/'), str(snapshot.pk))

				self.assertEqual(response.status_code, 302)
				snapshot.refresh_from_db()
				self.assertEqual(snapshot.source_name, 'here_places')
				self.assertEqual(snapshot.external_id, 'here:cronies-ventura')
				stored_records = load_discovery_json_records(file_path=json_path)
				self.assertEqual(len(stored_records), 1)
				self.assertEqual(stored_records[0].external_id, 'here:cronies-ventura')

				self.admin.delete_model(self._build_request('/admin/places/listingsnapshot/'), snapshot)

				self.assertFalse(ListingSnapshot.objects.filter(pk=snapshot.pk).exists())
				self.assertEqual(load_discovery_json_records(file_path=json_path), [])
				deleted_business = DeletedBusiness.objects.get(external_id='here:cronies-ventura')
				self.assertEqual(deleted_business.name, 'Cronies Sports Grill')

				response = self.deleted_admin.restore_business_view(self._build_request(f'/admin/places/deletedbusiness/{deleted_business.pk}/restore-business/'), str(deleted_business.pk))

				self.assertEqual(response.status_code, 302)
				self.assertFalse(DeletedBusiness.objects.filter(pk=deleted_business.pk).exists())
				restored_snapshot = ListingSnapshot.objects.get(external_id='here:cronies-ventura')
				self.assertEqual(restored_snapshot.name, 'Cronies Sports Grill')
				restored_records = load_discovery_json_records(file_path=json_path)
				self.assertEqual(len(restored_records), 1)
				self.assertEqual(restored_records[0].external_id, 'here:cronies-ventura')

	@override_settings(DISCOVERY_JSON_PATH='')
	def test_pull_business_data_view_preserves_manual_website_and_overrides_when_pulled_record_has_no_website(self):
		with TemporaryDirectory() as temp_dir:
			json_path = Path(temp_dir) / 'discovered_places.json'
			snapshot = ListingSnapshot.objects.create(
				name='Cronies Sports Grill',
				city=City.VENTURA,
				venue_type=VenueType.BAR,
				address_line_1='2855 Johnson Dr',
				website_url='https://admin.example.com/cronies',
				deal_overrides=[{
					'title': 'Admin Deal',
					'description': 'Still here',
					'deal_type': DealType.OTHER,
					'price_text': '$10',
					'terms': '',
					'happy_hours': [],
				}],
				operating_hour_overrides=[{'weekday': Weekday.MONDAY, 'open_time': '11:00', 'close_time': '21:00'}],
			)
			place_record = ImportedPlace(
				name='Cronies Sports Grill',
				city=City.VENTURA,
				venue_type=VenueType.BAR,
				address_line_1='2855 Johnson Dr',
				phone_number='(805) 650-6026',
				website_url='',
				external_id='here:cronies-ventura',
				source_name='here_places',
				source_url='https://discover.search.hereapi.com/v1/discover',
			)

			with override_settings(DISCOVERY_JSON_PATH=json_path), patch.object(HerePlacesImporter, 'load_records_for_search', return_value=[place_record]), patch.object(BusinessWebsiteImporter, 'enrich_place_record', return_value=place_record):
				response = self.admin.pull_business_data_view(self._build_request(f'/admin/places/listingsnapshot/{snapshot.pk}/pull-business-data/'), str(snapshot.pk))

			self.assertEqual(response.status_code, 302)
			snapshot.refresh_from_db()
			self.assertEqual(snapshot.website_url, 'https://admin.example.com/cronies')
			self.assertEqual(snapshot.deal_overrides[0]['title'], 'Admin Deal')
			self.assertEqual(snapshot.operating_hour_overrides[0]['weekday'], Weekday.MONDAY)

	@override_settings(DISCOVERY_JSON_PATH='')
	def test_pull_business_data_view_keeps_snapshot_website_public_and_snapshot_source_for_enrichment(self):
		with TemporaryDirectory() as temp_dir:
			json_path = Path(temp_dir) / 'discovered_places.json'
			snapshot = ListingSnapshot.objects.create(
				name='Cronies Sports Grill',
				city=City.VENTURA,
				venue_type=VenueType.BAR,
				address_line_1='2855 Johnson Dr',
				website_url='https://admin.example.com/cronies',
				source_url='https://admin.example.com/cronies/menu',
			)
			place_record = ImportedPlace(
				name='Cronies Sports Grill',
				city=City.VENTURA,
				venue_type=VenueType.BAR,
				address_line_1='2855 Johnson Dr',
				phone_number='(805) 650-6026',
				website_url='https://wrong.example.com/cronies',
				external_id='here:cronies-ventura',
				source_name='here_places',
				source_url='https://discover.search.hereapi.com/v1/discover',
			)

			def assert_enrichment_input(record):
				self.assertEqual(record.website_url, 'https://admin.example.com/cronies')
				self.assertEqual(record.source_url, 'https://admin.example.com/cronies/menu')
				return record

			with override_settings(DISCOVERY_JSON_PATH=json_path), patch.object(HerePlacesImporter, 'load_records_for_search', return_value=[place_record]), patch.object(BusinessWebsiteImporter, 'enrich_place_record', side_effect=assert_enrichment_input):
				response = self.admin.pull_business_data_view(self._build_request(f'/admin/places/listingsnapshot/{snapshot.pk}/pull-business-data/'), str(snapshot.pk))

			self.assertEqual(response.status_code, 302)

	@override_settings(DISCOVERY_JSON_PATH='')
	def test_pull_business_data_view_falls_back_to_snapshot_source_url_for_enrichment(self):
		with TemporaryDirectory() as temp_dir:
			json_path = Path(temp_dir) / 'discovered_places.json'
			snapshot = ListingSnapshot.objects.create(
				name='Cronies Sports Grill',
				city=City.VENTURA,
				venue_type=VenueType.BAR,
				address_line_1='2855 Johnson Dr',
				source_url='https://admin.example.com/cronies-source',
			)
			place_record = ImportedPlace(
				name='Cronies Sports Grill',
				city=City.VENTURA,
				venue_type=VenueType.BAR,
				address_line_1='2855 Johnson Dr',
				phone_number='(805) 650-6026',
				website_url='https://wrong.example.com/cronies',
				external_id='here:cronies-ventura',
				source_name='here_places',
				source_url='https://discover.search.hereapi.com/v1/discover',
			)

			def assert_enrichment_input(record):
				self.assertEqual(record.website_url, 'https://wrong.example.com/cronies')
				self.assertEqual(record.source_url, 'https://admin.example.com/cronies-source')
				return record

			with override_settings(DISCOVERY_JSON_PATH=json_path), patch.object(HerePlacesImporter, 'load_records_for_search', return_value=[place_record]), patch.object(BusinessWebsiteImporter, 'enrich_place_record', side_effect=assert_enrichment_input):
				response = self.admin.pull_business_data_view(self._build_request(f'/admin/places/listingsnapshot/{snapshot.pk}/pull-business-data/'), str(snapshot.pk))

			self.assertEqual(response.status_code, 302)

	@override_settings(DISCOVERY_JSON_PATH='')
	def test_pull_business_data_view_preserves_existing_admin_text_fields_when_pulled_record_has_new_values(self):
		with TemporaryDirectory() as temp_dir:
			json_path = Path(temp_dir) / 'discovered_places.json'
			snapshot = ListingSnapshot.objects.create(
				name='Admin Name',
				city=City.VENTURA,
				venue_type=VenueType.BAR,
				address_line_1='2855 Johnson Dr',
				address_line_2='Suite 100',
				neighborhood='Midtown',
				postal_code='93003',
				phone_number='805-555-9999',
				website_url='https://admin.example.com/cronies',
				deal_overrides=[{
					'title': 'Admin Deal',
					'description': 'Still here',
					'deal_type': DealType.OTHER,
					'price_text': '$10',
					'terms': '',
					'happy_hours': [],
				}],
				operating_hour_overrides=[{'weekday': Weekday.MONDAY, 'open_time': '11:00', 'close_time': '21:00'}],
			)
			place_record = ImportedPlace(
				name='Pulled Name',
				profile_name='Pulled Profile Name',
				city=City.OXNARD,
				venue_type=VenueType.RESTAURANT,
				address_line_1='2855 Johnson Dr',
				address_line_2='Suite 200',
				neighborhood='Downtown',
				postal_code='93030',
				phone_number='805-555-0101',
				website_url='https://pulled.example.com/cronies',
				external_id='here:cronies-ventura',
				source_name='here_places',
				source_url='https://discover.search.hereapi.com/v1/discover',
			)

			with override_settings(DISCOVERY_JSON_PATH=json_path), patch.object(HerePlacesImporter, 'load_records_for_search', return_value=[place_record]), patch.object(BusinessWebsiteImporter, 'enrich_place_record', return_value=place_record):
				response = self.admin.pull_business_data_view(self._build_request(f'/admin/places/listingsnapshot/{snapshot.pk}/pull-business-data/'), str(snapshot.pk))

			self.assertEqual(response.status_code, 302)
			snapshot.refresh_from_db()
			self.assertEqual(snapshot.name, 'Admin Name')
			self.assertEqual(snapshot.city, City.VENTURA)
			self.assertEqual(snapshot.venue_type, VenueType.BAR)
			self.assertEqual(snapshot.address_line_2, 'Suite 100')
			self.assertEqual(snapshot.neighborhood, 'Midtown')
			self.assertEqual(snapshot.postal_code, '93003')
			self.assertEqual(snapshot.phone_number, '805-555-9999')
			self.assertEqual(snapshot.website_url, 'https://admin.example.com/cronies')
			self.assertEqual(snapshot.source_name, 'here_places')

	@override_settings(DISCOVERY_JSON_PATH='')
	def test_pull_business_data_view_preserves_all_saved_admin_editable_fields(self):
		with TemporaryDirectory() as temp_dir:
			json_path = Path(temp_dir) / 'discovered_places.json'
			snapshot = ListingSnapshot.objects.create(
				name='Admin Name',
				listing_slug='admin-name',
				city=City.VENTURA,
				venue_type=VenueType.BAR,
				address_line_1='2855 Johnson Dr',
				address_line_2='Suite 100',
				neighborhood='Midtown',
				state='CA',
				postal_code='93003',
				phone_number='805-555-9999',
				website_url='https://admin.example.com/cronies',
				source_name='manual_admin_source',
				source_url='https://admin.example.com/source',
				external_id='admin-external-id',
				social_profiles={
					'facebook': {
						'url': 'https://facebook.com/adminspot',
						'username': 'adminspot',
					},
				},
				social_media_links=['https://facebook.com/adminspot'],
				deal_overrides=[{
					'title': 'Admin Deal',
					'description': 'Still here',
					'deal_type': DealType.OTHER,
					'price_text': '$10',
					'terms': '',
					'happy_hours': [],
				}],
				operating_hour_overrides=[{'weekday': Weekday.MONDAY, 'open_time': '11:00', 'close_time': '21:00'}],
			)
			place_record = ImportedPlace(
				name='Pulled Name',
				profile_name='Pulled Profile Name',
				city=City.OXNARD,
				venue_type=VenueType.RESTAURANT,
				address_line_1='999 Wrong St',
				address_line_2='Suite 200',
				neighborhood='Downtown',
				state='NV',
				postal_code='93030',
				phone_number='805-555-0101',
				website_url='https://pulled.example.com/cronies',
				external_id='here:cronies-ventura',
				source_name='here_places',
				source_url='https://discover.search.hereapi.com/v1/discover',
			)

			with override_settings(DISCOVERY_JSON_PATH=json_path), patch.object(HerePlacesImporter, 'load_records_for_search', return_value=[place_record]), patch.object(BusinessWebsiteImporter, 'enrich_place_record', return_value=place_record):
				response = self.admin.pull_business_data_view(self._build_request(f'/admin/places/listingsnapshot/{snapshot.pk}/pull-business-data/'), str(snapshot.pk))

			self.assertEqual(response.status_code, 302)
			snapshot.refresh_from_db()
			self.assertEqual(snapshot.name, 'Admin Name')
			self.assertEqual(snapshot.listing_slug, 'admin-name')
			self.assertEqual(snapshot.city, City.VENTURA)
			self.assertEqual(snapshot.venue_type, VenueType.BAR)
			self.assertEqual(snapshot.address_line_1, '2855 Johnson Dr')
			self.assertEqual(snapshot.address_line_2, 'Suite 100')
			self.assertEqual(snapshot.neighborhood, 'Midtown')
			self.assertEqual(snapshot.state, 'CA')
			self.assertEqual(snapshot.postal_code, '93003')
			self.assertEqual(snapshot.phone_number, '805-555-9999')
			self.assertEqual(snapshot.website_url, 'https://admin.example.com/cronies')
			self.assertEqual(snapshot.source_name, 'manual_admin_source')
			self.assertEqual(snapshot.source_url, 'https://admin.example.com/source')
			self.assertEqual(snapshot.external_id, 'admin-external-id')
			self.assertEqual(
				snapshot.social_profiles,
				{
					'facebook': {
						'url': 'https://facebook.com/adminspot',
						'username': 'adminspot',
					},
				},
			)
			self.assertEqual(snapshot.social_media_links, ['https://facebook.com/adminspot'])
			self.assertEqual(snapshot.deal_overrides[0]['title'], 'Admin Deal')
			self.assertEqual(snapshot.operating_hour_overrides[0]['weekday'], Weekday.MONDAY)

	def test_get_queryset_includes_admin_created_manual_submissions_but_excludes_unmanaged_claim_submissions(self):
		public_snapshot = ListingSnapshot.objects.create(
			name='Pulled Place',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
			source_name='here_places',
		)
		manual_claim_snapshot = ListingSnapshot.objects.create(
			name='Draft Manual Claim Place',
			city=City.OXNARD,
			venue_type=VenueType.RESTAURANT,
			address_line_1='456 Harbor Blvd',
			source_name=BusinessClaim.MANUAL_SOURCE_NAME,
		)
		manual_admin_snapshot = ListingSnapshot.objects.create(
			name='Draft Manual Admin Place',
			city=City.OXNARD,
			venue_type=VenueType.RESTAURANT,
			address_line_1='457 Harbor Blvd',
			source_name=BusinessClaim.ADMIN_SOURCE_NAME,
		)
		manual_claim_user = User.objects.create_user(username='draft_manual_owner', email='draft-manual@example.com', password='test-pass-123')
		BusinessClaim.objects.create(
			claimant=manual_claim_user,
			listing_snapshot=manual_claim_snapshot,
			pathway=BusinessClaim.Pathway.ESTABLISHED,
			status=BusinessClaim.Status.UNDER_REVIEW,
			contact_name='Draft Owner',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='draft-manual@example.com',
		)
		approved_manual_snapshot = ListingSnapshot.objects.create(
			name='Approved Manual Place',
			city=City.CAMARILLO,
			venue_type=VenueType.CAFE,
			address_line_1='789 Ventura Blvd',
			source_name=BusinessClaim.MANUAL_SOURCE_NAME,
		)
		approved_user = User.objects.create_user(username='approved_manual_owner', email='approved-manual@example.com', password='test-pass-123')
		approved_claim = BusinessClaim.objects.create(
			claimant=approved_user,
			listing_snapshot=approved_manual_snapshot,
			pathway=BusinessClaim.Pathway.ESTABLISHED,
			status=BusinessClaim.Status.APPROVED,
			contact_name='Approved Owner',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='approved-manual@example.com',
			verification_summary='Approved manual business.',
		)
		BusinessMembership.objects.create(user=approved_user, claim=approved_claim, is_active=True)

		queryset = self.admin.get_queryset(self._build_request('/admin/places/listingsnapshot/'))

		self.assertIn(public_snapshot, queryset)
		self.assertNotIn(manual_claim_snapshot, queryset)
		self.assertIn(manual_admin_snapshot, queryset)
		self.assertIn(approved_manual_snapshot, queryset)

	def test_listing_snapshot_changelist_can_filter_managed_businesses(self):
		managed_snapshot = ListingSnapshot.objects.create(
			name='Managed Spot',
			listing_slug='managed-spot',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
			source_name='here_places',
		)
		unmanaged_snapshot = ListingSnapshot.objects.create(
			name='Unmanaged Spot',
			listing_slug='unmanaged-spot',
			city=City.OXNARD,
			venue_type=VenueType.CAFE,
			address_line_1='456 Harbor Blvd',
			source_name='here_places',
		)
		owner = User.objects.create_user(username='managed_snapshot_owner', email='managed_snapshot_owner@example.com', password='test-pass-123')
		claim = BusinessClaim.objects.create(
			claimant=owner,
			listing_snapshot=managed_snapshot,
			pathway=BusinessClaim.Pathway.CLAIMED,
			status=BusinessClaim.Status.APPROVED,
			contact_name='Managed Owner',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='managed@example.com',
			verification_summary='Approved managed business.',
		)
		BusinessMembership.objects.create(user=owner, claim=claim, is_active=True)
		self.client.force_login(self.admin_user)

		managed_response = self.client.get(reverse('happyhour_admin:places_listingsnapshot_changelist'), {'managed_by_business_user': 'yes'})
		unmanaged_response = self.client.get(reverse('happyhour_admin:places_listingsnapshot_changelist'), {'managed_by_business_user': 'no'})

		self.assertEqual(managed_response.status_code, 200)
		self.assertContains(managed_response, 'Managed Spot')
		self.assertNotContains(managed_response, 'Unmanaged Spot')
		self.assertEqual(unmanaged_response.status_code, 200)
		self.assertContains(unmanaged_response, 'Unmanaged Spot')
		self.assertNotContains(unmanaged_response, 'Managed Spot')

	def test_listing_snapshot_changelist_can_filter_businesses_with_images(self):
		with_images_snapshot = ListingSnapshot.objects.create(
			name='Photo Spot',
			listing_slug='photo-spot',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
			source_name='here_places',
			imported_image_urls=['https://images.example.com/photo-spot.jpg'],
		)
		without_images_snapshot = ListingSnapshot.objects.create(
			name='No Photo Spot',
			listing_slug='no-photo-spot',
			city=City.OXNARD,
			venue_type=VenueType.CAFE,
			address_line_1='456 Harbor Blvd',
			source_name='here_places',
			imported_image_urls=[],
		)
		self.client.force_login(self.admin_user)

		with_images_response = self.client.get(reverse('happyhour_admin:places_listingsnapshot_changelist'), {'has_images': 'yes'})
		without_images_response = self.client.get(reverse('happyhour_admin:places_listingsnapshot_changelist'), {'has_images': 'no'})
		with_image_names = {snapshot.name for snapshot in with_images_response.context['cl'].queryset}
		without_image_names = {snapshot.name for snapshot in without_images_response.context['cl'].queryset}

		self.assertEqual(with_images_response.status_code, 200)
		self.assertIn(with_images_snapshot.name, with_image_names)
		self.assertNotIn(without_images_snapshot.name, with_image_names)
		self.assertEqual(without_images_response.status_code, 200)
		self.assertIn(without_images_snapshot.name, without_image_names)
		self.assertNotIn(with_images_snapshot.name, without_image_names)

	def test_listing_snapshot_change_page_links_to_managing_business_account(self):
		snapshot = ListingSnapshot.objects.create(
			name='Linked Managed Spot',
			listing_slug='linked-managed-spot',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
			source_name='here_places',
		)
		owner = User.objects.create_user(username='linked_manager', email='linked_manager@example.com', password='test-pass-123')
		claim = BusinessClaim.objects.create(
			claimant=owner,
			listing_snapshot=snapshot,
			pathway=BusinessClaim.Pathway.CLAIMED,
			status=BusinessClaim.Status.APPROVED,
			contact_name='Linked Owner',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='linked@example.com',
			verification_summary='Approved managed business.',
		)
		BusinessMembership.objects.create(user=owner, claim=claim, is_active=True)
		self.client.force_login(self.admin_user)

		response = self.client.get(reverse('happyhour_admin:places_listingsnapshot_change', args=[snapshot.pk]))

		self.assertEqual(response.status_code, 200)
		self.assertContains(response, 'Managed business account')
		self.assertContains(response, reverse('happyhour_admin:places_businessaccount_change', args=[owner.pk]))
		self.assertContains(response, 'Open linked_manager')

	def test_search_businesses_view_returns_matching_rows(self):
		match_snapshot = ListingSnapshot.objects.create(
			name='Lure Fish House',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='60 S California St',
			source_name='here_places',
		)
		ListingSnapshot.objects.create(
			name='Harbor Tacos',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
			source_name='here_places',
		)

		response = self.admin.search_businesses_view(self._build_request('/admin/places/listingsnapshot/search-businesses/?q=Lure'))

		self.assertEqual(response.status_code, 200)
		payload = json.loads(response.content)
		self.assertEqual(payload['count'], 1)
		self.assertEqual(payload['results'][0]['name'], 'Lure Fish House')
		self.assertEqual(payload['results'][0]['change_url'], reverse('happyhour_admin:places_listingsnapshot_change', args=[match_snapshot.pk]))

	def test_deleted_business_admin_allows_hard_delete(self):
		request = self._build_request('/admin/places/deletedbusiness/')

		self.assertTrue(self.deleted_admin.has_delete_permission(request))
		self.assertIn('delete_selected', self.deleted_admin.get_actions(request))


class BusinessClaimAdminTests(TestCase):
	def setUp(self):
		self.site = AdminSite()
		self.admin = BusinessClaimAdmin(BusinessClaim, self.site)
		self.admin_user = User.objects.create_superuser(username='claim_admin', email='claim_admin@example.com', password='test-pass-123')
		self.claimant = User.objects.create_user(username='claim_owner', email='owner@example.com', password='test-pass-123')
		self.snapshot = ListingSnapshot.objects.create(
			name='Claimed Place',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
			source_name=BusinessClaim.MANUAL_SOURCE_NAME,
		)
		self.claim = BusinessClaim.objects.create(
			claimant=self.claimant,
			listing_snapshot=self.snapshot,
			pathway=BusinessClaim.Pathway.ESTABLISHED,
			status=BusinessClaim.Status.SUBMITTED,
			contact_name='Owner Name',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='owner@claimed-place.com',
			work_phone='805-555-0199',
			employer_address='123 Main St',
			business_website_url='https://claimed-place.example.com',
			verification_summary='Submitted through testing.',
		)
		BusinessClaimProfileEntry.objects.create(
			claim=self.claim,
			entry_kind=BusinessClaim.ProfileEntryKind.SOCIAL_MEDIA_LINK,
			value='https://instagram.com/claimedplace',
			sort_order=0,
		)
		BusinessClaimAttachment.objects.create(
			claim=self.claim,
			attachment_kind=BusinessClaimAttachment.AttachmentKind.PROOF_OF_AUTHORITY,
			file=SimpleUploadedFile('authority.pdf', b'authority-file', content_type='application/pdf'),
			original_filename='authority.pdf',
			content_type='application/pdf',
			file_size=14,
		)

	def test_change_view_shows_submitted_related_claim_data(self):
		self.client.force_login(self.admin_user)

		response = self.client.get(reverse('happyhour_admin:places_businessclaim_change', args=[self.claim.pk]))

		self.assertEqual(response.status_code, 200)
		self.assertContains(response, 'Submitted profile entries')
		self.assertContains(response, 'Submitted attachments')
		self.assertContains(response, 'https://instagram.com/claimedplace')
		self.assertContains(response, 'authority.pdf')
		self.assertContains(response, 'https://claimed-place.example.com')
		self.assertContains(response, BusinessClaim.Pathway.ESTABLISHED)
		self.assertContains(response, '0.0000 GB')
		self.assertContains(response, 'Business registration document is invalid, incomplete, or unclear')
		self.assertContains(response, 'Rejection Reasons')
		self.assertContains(response, 'rejection-reasons-list')
		self.assertContains(response, 'Attempt #')
		self.assertContains(response, 'Current attempt')
		self.assertContains(response, 'No earlier claim attempts found.')

	def test_change_view_shows_prior_attempts_for_same_account_email(self):
		prior_rejected_claim = BusinessClaim.objects.create(
			claimant=self.claimant,
			listing_snapshot=self.snapshot,
			pathway=BusinessClaim.Pathway.ESTABLISHED,
			status=BusinessClaim.Status.REJECTED,
			contact_name='Owner Name',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='owner+rejected@claimed-place.com',
			work_phone='805-555-0101',
			employer_address='123 Main St',
			business_website_url='https://claimed-place.example.com',
			verification_summary='Earlier rejected attempt.',
			reviewed_at=timezone.now(),
			reviewed_by=self.admin_user,
			rejection_reason_codes=[BusinessClaim.RejectionReason.PROOF_OF_AUTHORITY_INVALID],
		)
		BusinessClaim.objects.filter(pk=prior_rejected_claim.pk).update(created_at=self.claim.created_at - timedelta(minutes=1))
		prior_rejected_claim.refresh_from_db()
		other_snapshot = ListingSnapshot.objects.create(
			name='Second Business',
			city=City.OXNARD,
			venue_type=VenueType.CAFE,
			address_line_1='456 Harbor Blvd',
			source_name=BusinessClaim.MANUAL_SOURCE_NAME,
		)
		cross_business_claim = BusinessClaim.objects.create(
			claimant=self.claimant,
			listing_snapshot=other_snapshot,
			pathway=BusinessClaim.Pathway.ESTABLISHED,
			status=BusinessClaim.Status.REJECTED,
			contact_name='Owner Name',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='owner+second@claimed-place.com',
			work_phone='805-555-0109',
			employer_address='456 Harbor Blvd',
			business_website_url='https://second-business.example.com',
			verification_summary='Rejected attempt for a different business under the same account email.',
			reviewed_at=timezone.now(),
			reviewed_by=self.admin_user,
			rejection_reason_codes=[BusinessClaim.RejectionReason.ADDRESS_INVALID],
		)
		BusinessClaim.objects.filter(pk=cross_business_claim.pk).update(created_at=self.claim.created_at - timedelta(seconds=30))
		cross_business_claim.refresh_from_db()
		other_user = User.objects.create_user(username='other_attempt_owner', email='other-attempt-owner@example.com', password='test-pass-123')
		BusinessClaim.objects.create(
			claimant=other_user,
			listing_snapshot=self.snapshot,
			pathway=BusinessClaim.Pathway.ESTABLISHED,
			status=BusinessClaim.Status.REJECTED,
			contact_name='Other Owner',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='other-owner@claimed-place.com',
			work_phone='805-555-0102',
			employer_address='123 Main St',
			business_website_url='https://claimed-place.example.com',
			verification_summary='Other user rejected attempt.',
			reviewed_at=timezone.now(),
			reviewed_by=self.admin_user,
			rejection_reason_codes=[BusinessClaim.RejectionReason.ADDRESS_INVALID],
		)

		self.client.force_login(self.admin_user)
		response = self.client.get(reverse('happyhour_admin:places_businessclaim_change', args=[self.claim.pk]))

		self.assertEqual(response.status_code, 200)
		self.assertEqual(self.admin.attempt_number_display(self.claim), 3)
		self.assertIn('Yes', str(self.admin.current_attempt_display(self.claim)))
		self.assertEqual(self.admin.prior_rejection_count_display(self.claim), 2)
		self.assertContains(response, 'Older attempts for the same claimant account email stay in the database for audit history.')
		self.assertContains(response, 'Prior rejections')
		self.assertContains(response, 'Rejected')
		self.assertContains(response, self.claimant.username)
		self.assertContains(response, prior_rejected_claim.contact_name)
		self.assertContains(response, cross_business_claim.listing_snapshot.name)
		self.assertNotContains(response, 'other_attempt_owner')

	def test_changelist_can_filter_claims_with_prior_rejections(self):
		repeat_claim_user = User.objects.create_user(username='prior_filter_owner', email='prior-filter-owner@example.com', password='test-pass-123')
		other_snapshot = ListingSnapshot.objects.create(
			name='Other Place',
			city=City.OXNARD,
			venue_type=VenueType.CAFE,
			address_line_1='456 Side St',
			source_name=BusinessClaim.MANUAL_SOURCE_NAME,
		)
		other_user = User.objects.create_user(username='isolated_owner', email='isolated-owner@example.com', password='test-pass-123')

		BusinessClaim.objects.create(
			claimant=repeat_claim_user,
			listing_snapshot=self.snapshot,
			pathway=BusinessClaim.Pathway.ESTABLISHED,
			status=BusinessClaim.Status.REJECTED,
			contact_name='Owner Name',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='owner@claimed-place.com',
			work_phone='805-555-0105',
			employer_address='123 Main St',
			business_website_url='https://claimed-place.example.com',
			verification_summary='Rejected attempt for filter coverage.',
			reviewed_at=timezone.now(),
			reviewed_by=self.admin_user,
			rejection_reason_codes=[BusinessClaim.RejectionReason.ADDRESS_INVALID],
		)
		repeated_claim = BusinessClaim.objects.create(
			claimant=repeat_claim_user,
			listing_snapshot=self.snapshot,
			pathway=BusinessClaim.Pathway.ESTABLISHED,
			status=BusinessClaim.Status.APPROVED,
			contact_name='Owner Name',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='owner@claimed-place.com',
			work_phone='805-555-0106',
			employer_address='123 Main St',
			business_website_url='https://claimed-place.example.com',
			verification_summary='Approved attempt for filter coverage.',
			reviewed_at=timezone.now(),
			reviewed_by=self.admin_user,
		)
		BusinessClaim.objects.create(
			claimant=other_user,
			listing_snapshot=other_snapshot,
			pathway=BusinessClaim.Pathway.ESTABLISHED,
			status=BusinessClaim.Status.SUBMITTED,
			contact_name='Other Owner',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='other@other-place.com',
			work_phone='805-555-0107',
			employer_address='456 Side St',
			business_website_url='https://other-place.example.com',
			verification_summary='Independent attempt with no prior rejection.',
		)

		self.client.force_login(self.admin_user)
		response = self.client.get(reverse('happyhour_admin:places_businessclaim_changelist'), {'has_prior_rejections': 'yes'})

		self.assertEqual(response.status_code, 200)
		self.assertContains(response, repeated_claim.claimant.username)
		self.assertNotContains(response, 'claim_owner')
		self.assertNotContains(response, 'isolated_owner')

	def test_changelist_groups_attempts_by_account_email_across_business_names(self):
		repeat_claim_user = User.objects.create_user(username='email_group_owner', email='email-group@example.com', password='test-pass-123')
		first_snapshot = ListingSnapshot.objects.create(
			name='First Business',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='111 Main St',
			source_name=BusinessClaim.MANUAL_SOURCE_NAME,
		)
		second_snapshot = ListingSnapshot.objects.create(
			name='Second Business',
			city=City.OXNARD,
			venue_type=VenueType.CAFE,
			address_line_1='222 Harbor Blvd',
			source_name=BusinessClaim.MANUAL_SOURCE_NAME,
		)

		first_claim = BusinessClaim.objects.create(
			claimant=repeat_claim_user,
			listing_snapshot=first_snapshot,
			pathway=BusinessClaim.Pathway.ESTABLISHED,
			status=BusinessClaim.Status.REJECTED,
			contact_name='Owner Name',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='owner@first-business.com',
			work_phone='805-555-0201',
			employer_address='111 Main St',
			business_website_url='https://first-business.example.com',
			verification_summary='First rejected attempt.',
			reviewed_at=timezone.now(),
			reviewed_by=self.admin_user,
			rejection_reason_codes=[BusinessClaim.RejectionReason.PROOF_OF_AUTHORITY_INVALID],
		)
		second_claim = BusinessClaim.objects.create(
			claimant=repeat_claim_user,
			listing_snapshot=second_snapshot,
			pathway=BusinessClaim.Pathway.ESTABLISHED,
			status=BusinessClaim.Status.SUBMITTED,
			contact_name='Owner Name',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='owner@second-business.com',
			work_phone='805-555-0202',
			employer_address='222 Harbor Blvd',
			business_website_url='https://second-business.example.com',
			verification_summary='Second attempt under a new business name.',
		)

		self.client.force_login(self.admin_user)
		response = self.client.get(reverse('happyhour_admin:places_businessclaim_changelist'))

		self.assertEqual(response.status_code, 200)
		self.assertEqual(self.admin.attempt_number_display(first_claim), 1)
		self.assertEqual(self.admin.attempt_number_display(second_claim), 2)
		self.assertEqual(self.admin.prior_rejection_count_display(second_claim), 1)
		self.assertIn('No', str(self.admin.current_attempt_display(first_claim)))
		self.assertIn('Yes', str(self.admin.current_attempt_display(second_claim)))
		self.assertContains(response, 'email-group@example.com')

	def test_changelist_shows_attempt_number_and_current_attempt_marker(self):
		repeat_claim_user = User.objects.create_user(username='attempt_owner', email='attempt-owner@example.com', password='test-pass-123')
		attempt_snapshot = ListingSnapshot.objects.create(
			name='Attempt Place',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='456 Attempt St',
			source_name=BusinessClaim.MANUAL_SOURCE_NAME,
		)

		first_attempt = BusinessClaim.objects.create(
			claimant=repeat_claim_user,
			listing_snapshot=attempt_snapshot,
			pathway=BusinessClaim.Pathway.ESTABLISHED,
			status=BusinessClaim.Status.REJECTED,
			contact_name='Owner Name',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='owner@claimed-place.com',
			work_phone='805-555-0101',
			employer_address='123 Main St',
			business_website_url='https://claimed-place.example.com',
			verification_summary='First rejected attempt.',
			reviewed_at=timezone.now(),
			reviewed_by=self.admin_user,
			rejection_reason_codes=[BusinessClaim.RejectionReason.PROOF_OF_AUTHORITY_INVALID],
		)
		latest_claim = BusinessClaim.objects.create(
			claimant=repeat_claim_user,
			listing_snapshot=attempt_snapshot,
			pathway=BusinessClaim.Pathway.ESTABLISHED,
			status=BusinessClaim.Status.SUBMITTED,
			contact_name='Owner Name',
			job_title=BusinessClaim.JobTitle.OWNER,
			work_email='owner@claimed-place.com',
			work_phone='805-555-0102',
			employer_address='123 Main St',
			business_website_url='https://claimed-place.example.com',
			verification_summary='Latest attempt.',
		)

		self.client.force_login(self.admin_user)
		response = self.client.get(reverse('happyhour_admin:places_businessclaim_changelist'))

		self.assertEqual(response.status_code, 200)
		self.assertContains(response, 'Attempt #')
		self.assertContains(response, 'Current attempt')
		self.assertContains(response, 'claim-attempt-toggle')
		self.assertEqual(self.admin.attempt_number_display(first_attempt), 1)
		self.assertEqual(self.admin.attempt_number_display(latest_claim), 2)
		self.assertIn('Yes', str(self.admin.current_attempt_display(latest_claim)))
		self.assertIn('No', str(self.admin.current_attempt_display(first_attempt)))

	def test_delete_is_available_for_business_claims(self):
		request = RequestFactory().get('/admin/places/businessclaim/')
		request.user = self.admin_user

		self.assertTrue(self.admin.has_delete_permission(request, self.claim))
		self.assertIn('delete_selected', self.admin.get_actions(request))

	def test_delete_confirmation_shows_warning_and_scrollable_claim_summary(self):
		self.client.force_login(self.admin_user)

		response = self.client.get(reverse('happyhour_admin:places_businessclaim_delete', args=[self.claim.pk]))

		self.assertEqual(response.status_code, 200)
		self.assertContains(response, 'Are you sure you want to delete this business claim?')
		self.assertContains(response, 'Review the claim details below before permanently deleting it.')
		self.assertContains(response, 'business-claim-delete-warning__list')
		self.assertContains(response, self.snapshot.name)
		self.assertContains(response, self.claim.contact_name)
		self.assertContains(response, self.claim.claimant.email)

	def test_approve_selected_claims_shows_force_approval_warning_for_blocked_claims(self):
		self.claim.refresh_verification_state(save=True)
		self.client.force_login(self.admin_user)

		response = self.client.post(
			reverse('happyhour_admin:places_businessclaim_changelist'),
			{
				'action': 'approve_selected_claims',
				helpers.ACTION_CHECKBOX_NAME: [str(self.claim.pk)],
				'index': '0',
			},
		)

		self.assertEqual(response.status_code, 200)
		self.assertContains(response, 'Approve blocked business claims anyway?')
		self.assertContains(response, 'Required permit documentation is still missing.')
		self.assertContains(response, 'Approve anyway')

	def test_approve_selected_claims_can_force_approve_after_confirmation(self):
		self.claim.refresh_verification_state(save=True)
		self.client.force_login(self.admin_user)

		response = self.client.post(
			reverse('happyhour_admin:places_businessclaim_changelist'),
			{
				'action': 'approve_selected_claims',
				helpers.ACTION_CHECKBOX_NAME: [str(self.claim.pk)],
				'index': '0',
				'force_approve': '1',
			},
			follow=True,
		)

		self.assertEqual(response.status_code, 200)
		self.claim.refresh_from_db()
		self.assertEqual(self.claim.status, BusinessClaim.Status.APPROVED)
		self.assertTrue(BusinessMembership.objects.filter(claim=self.claim, is_active=True).exists())

	def test_bulk_delete_confirmation_lists_selected_claims_in_scrollable_warning(self):
		other_claimant = User.objects.create_user(username='second_claim_owner', email='second-owner@example.com', password='test-pass-123')
		other_snapshot = ListingSnapshot.objects.create(
			name='Second Claimed Place',
			city=City.OXNARD,
			venue_type=VenueType.CAFE,
			address_line_1='456 Harbor Blvd',
			source_name=BusinessClaim.MANUAL_SOURCE_NAME,
		)
		other_claim = BusinessClaim.objects.create(
			claimant=other_claimant,
			listing_snapshot=other_snapshot,
			pathway=BusinessClaim.Pathway.CLAIMED,
			status=BusinessClaim.Status.UNDER_REVIEW,
			contact_name='Second Owner',
			job_title=BusinessClaim.JobTitle.MANAGER,
			work_email='second@claimed-place.com',
			verification_summary='Second submitted claim.',
		)

		self.client.force_login(self.admin_user)
		response = self.client.post(
			reverse('happyhour_admin:places_businessclaim_changelist'),
			{
				'action': 'delete_selected',
				helpers.ACTION_CHECKBOX_NAME: [str(self.claim.pk), str(other_claim.pk)],
				'index': '0',
			},
		)

		self.assertEqual(response.status_code, 200)
		self.assertContains(response, 'Are you sure you want to delete these business claims?')
		self.assertContains(response, 'Review the selected claims below before permanently deleting them.')
		self.assertContains(response, 'business-claim-delete-warning__list')
		self.assertContains(response, self.snapshot.name)
		self.assertContains(response, other_snapshot.name)
		self.assertContains(response, self.claim.claimant.email)
		self.assertContains(response, other_claim.claimant.email)



class MediaStorageCleanupTests(TestCase):
	def setUp(self):
		self.claimant = User.objects.create_user(username='media_cleanup_owner', email='media-cleanup@example.com', password='test-pass-123')
		self.snapshot = ListingSnapshot.objects.create(
			name='Media Cleanup Bistro',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
		)

	def create_claim(self, **overrides):
		claim_data = {
			'claimant': self.claimant,
			'listing_snapshot': self.snapshot,
			'pathway': BusinessClaim.Pathway.CLAIMED,
			'status': BusinessClaim.Status.SUBMITTED,
			'contact_name': 'Owner Name',
			'job_title': BusinessClaim.JobTitle.OWNER,
			'work_email': 'owner@cleanup.example.com',
			'work_phone': '805-555-0100',
			'employer_address': '123 Main St',
			'verification_summary': 'Testing media cleanup.',
		}
		claim_data.update(overrides)
		return BusinessClaim.objects.create(**claim_data)

	def test_deleting_claim_removes_uploaded_profile_photos_and_attachments(self):
		with TemporaryDirectory() as temp_dir:
			with override_settings(MEDIA_ROOT=Path(temp_dir)):
				photo_name = default_storage.save('business-profile-photos/cleanup/front.jpg', ContentFile(b'front-photo'))
				photo_path = Path(default_storage.path(photo_name))
				claim = self.create_claim(photo_references=[f'http://testserver/media/{photo_name}'], photo_gallery_overridden=True)
				attachment = BusinessClaimAttachment.objects.create(
					claim=claim,
					attachment_kind=BusinessClaimAttachment.AttachmentKind.PROOF_OF_AUTHORITY,
					file=SimpleUploadedFile('authority.pdf', b'authority-file', content_type='application/pdf'),
					original_filename='authority.pdf',
					content_type='application/pdf',
					file_size=14,
				)
				attachment_path = Path(attachment.file.path)

				self.assertTrue(photo_path.exists())
				self.assertTrue(attachment_path.exists())

				claim.delete()

				self.assertFalse(photo_path.exists())
				self.assertFalse(attachment_path.exists())

	def test_updating_claim_photo_references_deletes_removed_uploaded_files(self):
		with TemporaryDirectory() as temp_dir:
			with override_settings(MEDIA_ROOT=Path(temp_dir)):
				photo_name = default_storage.save('business-profile-photos/cleanup/remove-me.jpg', ContentFile(b'remove-me'))
				photo_path = Path(default_storage.path(photo_name))
				claim = self.create_claim(photo_references=[f'http://testserver/media/{photo_name}'], photo_gallery_overridden=True)

				self.assertTrue(photo_path.exists())

				claim.photo_references = ['https://images.example.com/keep-external.jpg']
				claim.save(update_fields=['photo_references', 'updated_at'])

				self.assertFalse(photo_path.exists())

	def test_cleanup_orphaned_media_command_deletes_unreferenced_local_files(self):
		with TemporaryDirectory() as temp_dir:
			with override_settings(MEDIA_ROOT=Path(temp_dir)):
				active_name = default_storage.save('business-profile-photos/cleanup/active.jpg', ContentFile(b'active-photo'))
				orphan_name = default_storage.save('business-profile-photos/cleanup/orphan.jpg', ContentFile(b'orphan-photo'))
				self.create_claim(photo_references=[f'http://testserver/media/{active_name}'], photo_gallery_overridden=True)

				stdout = StringIO()
				call_command('cleanup_orphaned_media', '--delete', stdout=stdout)

				self.assertTrue(Path(default_storage.path(active_name)).exists())
				self.assertFalse(Path(default_storage.path(orphan_name)).exists())
				self.assertIn('Deleted 1 orphaned file(s).', stdout.getvalue())


class HappyHourAdminSiteTests(TestCase):
	def setUp(self):
		self.admin_user = User.objects.create_superuser(username='site_admin', email='site_admin@example.com', password='test-pass-123')

	def test_admin_index_shows_database_storage_in_header(self):
		self.client.force_login(self.admin_user)

		with patch.object(
			happyhour_admin_site,
			'get_total_admin_storage_breakdown',
			return_value={
				'database_bytes': 5 * 1024 * 1024,
				'media_bytes': 2 * 1024 * 1024,
				'discovery_bytes': 512 * 1024,
				'total_bytes': (5 * 1024 * 1024) + (2 * 1024 * 1024) + (512 * 1024),
			},
		):
			response = self.client.get(reverse('happyhour_admin:index'))

		self.assertEqual(response.status_code, 200)
		self.assertContains(response, 'Total stored data')
		self.assertContains(response, '7.50 MB')
		self.assertContains(response, 'DB 5.00 MB')
		self.assertContains(response, 'uploads 2.00 MB')
		self.assertContains(response, 'discovery 512.00 KB')
		self.assertContains(response, '5.00 MB')
		self.assertContains(response, '0.0073 GB')


class ProviderUsageWindowAdminTests(TestCase):
	def setUp(self):
		self.site = AdminSite()
		self.admin = ProviderUsageWindowAdmin(ProviderUsageWindow, self.site)
		self.request_factory = RequestFactory()
		self.admin_user = User.objects.create_superuser(username='provider_usage_admin', email='provider_usage_admin@example.com', password='test-pass-123')

	def _build_request(self, path='/admin/'):
		request = self.request_factory.get(path)
		request.user = self.admin_user
		setattr(request, 'session', {})
		setattr(request, '_messages', FallbackStorage(request))
		return request

	def test_get_queryset_deletes_stale_tomtom_daily_windows(self):
		today = timezone.localdate()
		stale_window = ProviderUsageWindow.objects.create(
			provider_name='tomtom_places',
			window_kind=ProviderUsageWindow.WindowKind.DAY,
			window_start=today - timedelta(days=1),
			consumed_transactions=3,
			transaction_limit=50000,
			reserve_threshold=250,
		)
		current_window = ProviderUsageWindow.objects.create(
			provider_name='tomtom_places',
			window_kind=ProviderUsageWindow.WindowKind.DAY,
			window_start=today,
			consumed_transactions=1,
			transaction_limit=50000,
			reserve_threshold=250,
		)
		here_window = ProviderUsageWindow.objects.create(
			provider_name='here_places',
			window_kind=ProviderUsageWindow.WindowKind.MONTH,
			window_start=today.replace(day=1),
			consumed_transactions=20,
			transaction_limit=250000,
			reserve_threshold=1000,
		)

		queryset = self.admin.get_queryset(self._build_request('/admin/places/providerusagewindow/'))

		self.assertFalse(ProviderUsageWindow.objects.filter(pk=stale_window.pk).exists())
		self.assertTrue(ProviderUsageWindow.objects.filter(pk=current_window.pk).exists())
		self.assertTrue(ProviderUsageWindow.objects.filter(pk=here_window.pk).exists())
		self.assertIn(current_window.pk, queryset.values_list('pk', flat=True))
