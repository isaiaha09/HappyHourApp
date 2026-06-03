import json
from datetime import timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.admin import helpers
from django.contrib.admin.sites import AdminSite
from django.contrib.messages.storage.fallback import FallbackStorage
from django.conf import settings
from django.core.cache import caches
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.exceptions import ValidationError
from django.test import RequestFactory, TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase
from bs4 import BeautifulSoup
import pyotp

from .admin import BusinessAccountAdmin, BusinessClaimAdmin, CustomerAccountAdmin, DeletedBusinessAdmin, ListingSnapshotAdmin, ProviderUsageWindowAdmin
from .admin_site import happyhour_admin_site
from .models import AccountProfile, BusinessAccount, BusinessClaim, BusinessClaimAttachment, BusinessClaimProfileEntry, BusinessMembership, City, CustomerAccount, DealType, DeletedBusiness, FavoriteBusiness, ListingSnapshot, ProfileAuthToken, ProviderUsageWindow, VenueType, Weekday
from .services.importers.base import BaseHtmlImporter
from .services.importers.business_websites import BusinessWebsiteImporter
from .services.importers.discovered_json_places import CuratedJsonPlacesImporter, DiscoveryJsonPlacesImporter, load_discovery_json_records, write_discovery_json_records
from .services.deleted_businesses import filter_deleted_business_records
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

			with self.settings(DISCOVERY_JSON_PATH=json_path):
				with patch.dict('places.management.commands.refresh_discovery_json.IMPORTER_REGISTRY', {'here_places': DummyDiscoveryImporter}, clear=False):
					call_command('refresh_discovery_json', '--source', 'here_places', stdout=output)

			records = load_discovery_json_records(json_path)

		self.assertEqual(len(records), 1)
		self.assertEqual(records[0].external_id, 'here:3')
		self.assertEqual(len(records[0].deals), 0)
		self.assertIn('Wrote 1 discovery places', output.getvalue())
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
					call_command('refresh_discovery_json', '--source', 'here_places', '--limit', '1', stdout=output)

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
				with patch.dict('places.management.commands.refresh_discovery_json.IMPORTER_REGISTRY', {'here_places': DummyDiscoveryImporter}, clear=False):
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
				with patch.dict('places.management.commands.refresh_discovery_json.IMPORTER_REGISTRY', {'here_places': DummyDiscoveryImporter}, clear=False):
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
				with patch.dict('places.management.commands.refresh_discovery_json.IMPORTER_REGISTRY', {'here_places': DummyDiscoveryImporter}, clear=False):
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
				with patch.dict('places.management.commands.refresh_discovery_json.IMPORTER_REGISTRY', {'here_places': DummyDiscoveryImporter}, clear=False):
					call_command('refresh_discovery_json', '--source', 'here_places', stdout=output)

			records = load_discovery_json_records(json_path)

		self.assertEqual(len(records), 1)
		self.assertEqual(records[0].external_id, 'here:3')


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
			work_phone='805-555-0100',
			employer_address='501 Collection Blvd Ste # 4130',
			business_website_url='https://owner.example.com/yard-house',
			social_media_links=['https://instagram.com/yardhouseoxnard'],
			offer_entries=['Late night appetizers half off'],
			hours_of_operation_entries=['Sun-Thu 11am-11pm'],
			photo_references=['https://images.example.com/yard-house-front.jpg'],
			supporting_details='Owner-managed specials and updates.',
			verification_summary='Approved claimed business verification.',
		)
		BusinessMembership.objects.create(claim=claim, user=owner, is_active=True)

		snapshot.website_url = 'https://imported.example.com/yard-house-refreshed'
		snapshot.save(update_fields=['website_url', 'updated_at'])

		payload = get_source_place_payload('yard-house')

		self.assertIsNotNone(payload)
		self.assertEqual(payload['website_url'], 'https://owner.example.com/yard-house')
		self.assertEqual(payload['locations'][0]['website_url'], 'https://owner.example.com/yard-house')
		self.assertEqual(payload['social_media_links'], ['https://instagram.com/yardhouseoxnard'])
		self.assertEqual(payload['offer_entries'], ['Late night appetizers half off'])
		self.assertEqual(payload['hours_of_operation_entries'], ['Sun-Thu 11am-11pm'])
		self.assertEqual(payload['photo_references'], ['https://images.example.com/yard-house-front.jpg'])
		self.assertEqual(payload['supporting_details'], 'Owner-managed specials and updates.')
		self.assertIn('https://images.example.com/yard-house-front.jpg', payload['image_urls'])

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
				'social_media_links': json.dumps(['https://instagram.com/finneysventura']),
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
		self.assertGreaterEqual(claim.verification_score, 60)
		self.assertIn(BusinessClaimAttachment.AttachmentKind.PROOF_OF_AUTHORITY, list(claim.attachments.values_list('attachment_kind', flat=True)))
		self.assertEqual(
			claim.get_profile_entry_values(BusinessClaim.ProfileEntryKind.SOCIAL_MEDIA_LINK),
			['https://instagram.com/finneysventura'],
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
		self.assertIn('Informal businesses need at least one social link, website, or photo reference before submission.', str(response.data))

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
			verification_summary='I own the business.',
			status=BusinessClaim.Status.APPROVED,
		)
		BusinessMembership.objects.create(claim=claim, user=self.user, is_active=True)

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
		self.assertEqual(response.data['business_contact']['offer_entries'], [])

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
				'social_media_links_text': 'https://instagram.com/approvedspot\nhttps://facebook.com/approvedspot',
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
		self.assertEqual(claim.supporting_details, 'Updated from the approved business dashboard.')
		self.assertEqual(snapshot.website_url, 'https://approved.example.com/old')
		self.assertEqual(
			claim.get_profile_entry_values(BusinessClaim.ProfileEntryKind.OFFER),
			['Happy hour tacos $5', 'Half off appetizers'],
		)
		self.assertEqual(response.data['business_contact']['business_website_url'], 'https://approved.example.com/new')
		self.assertEqual(response.data['business_contact']['social_media_links'], ['https://instagram.com/approvedspot', 'https://facebook.com/approvedspot'])

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
		self.assertFalse(self.profile.business_location_tracking_enabled)
		self.assertTrue(response.data['business_location_tracking_available'])
		self.assertFalse(response.data['business_location_tracking_enabled'])
		self.assertFalse(response.data['requires_business_location_tracking'])

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

	@override_settings(DISCOVERY_JSON_PATH='')
	def test_pull_all_business_data_view_writes_live_json_and_syncs_snapshots(self):
		with TemporaryDirectory() as temp_dir:
			json_path = Path(temp_dir) / 'discovered_places.json'
			place_record = ImportedPlace(
				name='Pulled Tacos',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='123 Main St',
				phone_number='805-555-0101',
				website_url='https://example.com/pulled-tacos',
				external_id='here:pull-all-1',
				source_name='here_places',
				source_url='https://discover.search.hereapi.com/v1/discover',
			)

			with override_settings(DISCOVERY_JSON_PATH=json_path), patch.object(HerePlacesImporter, 'load_records', return_value=[place_record]), patch('places.admin.load_source_records', return_value=[place_record]):
				response = self.admin.pull_all_business_data_view(self._build_request('/admin/places/listingsnapshot/pull-all-business-data/'))

				self.assertEqual(response.status_code, 302)
				stored_records = load_discovery_json_records(file_path=json_path)
				self.assertEqual(len(stored_records), 1)
				self.assertEqual(stored_records[0].name, 'Pulled Tacos')
				snapshot = ListingSnapshot.objects.get(source_name='here_places', external_id='here:pull-all-1')
				self.assertEqual(snapshot.name, 'Pulled Tacos')

	@override_settings(DISCOVERY_JSON_PATH='')
	def test_pull_all_business_data_view_skips_deleted_businesses(self):
		with TemporaryDirectory() as temp_dir:
			json_path = Path(temp_dir) / 'discovered_places.json'
			DeletedBusiness.objects.create(
				name='Filtered Spot',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='123 Main St',
				source_name='here_places',
				external_id='here:filtered-1',
			)
			place_record = ImportedPlace(
				name='Filtered Spot',
				city=City.VENTURA,
				venue_type=VenueType.RESTAURANT,
				address_line_1='123 Main St',
				external_id='here:filtered-1',
				source_name='here_places',
			)

			with override_settings(DISCOVERY_JSON_PATH=json_path), patch.object(HerePlacesImporter, 'load_records', return_value=[place_record]), patch('places.admin.load_source_records', return_value=[]):
				self.admin.pull_all_business_data_view(self._build_request('/admin/places/listingsnapshot/pull-all-business-data/'))

				self.assertEqual(load_discovery_json_records(file_path=json_path), [])
				self.assertFalse(ListingSnapshot.objects.filter(external_id='here:filtered-1').exists())

	@override_settings(DISCOVERY_JSON_PATH='')
	def test_pull_all_business_data_view_syncs_curated_source_records(self):
		with TemporaryDirectory() as temp_dir:
			json_path = Path(temp_dir) / 'discovered_places.json'
			discovery_record = ImportedPlace(
				name='Discovery Spot',
				city=City.OXNARD,
				venue_type=VenueType.RESTAURANT,
				address_line_1='1 Collection Blvd',
				external_id='here:discovery-1',
				source_name='here_places',
			)
			curated_record = ImportedPlace(
				name='Yard House',
				city=City.OXNARD,
				venue_type=VenueType.RESTAURANT,
				address_line_1='501 Collection Blvd',
				website_url='https://www.yardhouse.com/locations/ca/oxnard/oxnard-the-collection/8376',
				external_id='curated:yard-house',
				source_name='business_websites',
			)

			with override_settings(DISCOVERY_JSON_PATH=json_path), patch.object(HerePlacesImporter, 'load_records', return_value=[discovery_record]), patch('places.admin.load_source_records', return_value=[curated_record, discovery_record]):
				self.admin.pull_all_business_data_view(self._build_request('/admin/places/listingsnapshot/pull-all-business-data/'))

			self.assertTrue(ListingSnapshot.objects.filter(name='Yard House', source_name='business_websites').exists())
			self.assertTrue(ListingSnapshot.objects.filter(name='Discovery Spot', source_name='here_places').exists())

	@override_settings(DISCOVERY_JSON_PATH='')
	def test_pull_all_business_data_view_syncs_canonical_location_records(self):
		with TemporaryDirectory() as temp_dir:
			json_path = Path(temp_dir) / 'discovered_places.json'
			ventura_record = ImportedPlace(
				name='Cronies Sports Grill',
				profile_name='Cronies Sports Grill',
				city=City.VENTURA,
				venue_type=VenueType.BAR,
				address_line_1='2855 Johnson Dr',
				external_id='www-cronies-com-locations-bbc01135d657',
				source_name='business_websites',
			)
			partial_duplicate = ImportedPlace(
				name="Cronie's Sports Grill",
				profile_name="Cronie's Sports Grill",
				city=City.CAMARILLO,
				venue_type=VenueType.BAR,
				address_line_1='N Lantana St',
				external_id='here:cronies-camarillo-partial',
				source_name='here_places',
			)
			camarillo_record = ImportedPlace(
				name='Cronies Sports Grill Camarillo',
				profile_name='Cronies Sports Grill',
				city=City.CAMARILLO,
				venue_type=VenueType.BAR,
				address_line_1='370 N Lantana St',
				external_id='www-cronies-com-locations-bbc01135d657',
				source_name='business_websites',
			)

			with override_settings(DISCOVERY_JSON_PATH=json_path), patch.object(HerePlacesImporter, 'load_records', return_value=[]), patch('places.admin.load_canonical_source_records', return_value=[ventura_record, camarillo_record]):
				self.admin.pull_all_business_data_view(self._build_request('/admin/places/listingsnapshot/pull-all-business-data/'))

		cronies_snapshots = ListingSnapshot.objects.filter(address_line_1__in=['2855 Johnson Dr', '370 N Lantana St']).order_by('address_line_1')
		self.assertEqual(cronies_snapshots.count(), 2)
		self.assertEqual(
			set(cronies_snapshots.values_list('address_line_1', flat=True)),
			{'2855 Johnson Dr', '370 N Lantana St'},
		)

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

			with override_settings(DISCOVERY_JSON_PATH=json_path), patch.object(HerePlacesImporter, 'load_records_for_search', return_value=[place_record]):
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

	def test_get_queryset_excludes_non_public_manual_submissions(self):
		public_snapshot = ListingSnapshot.objects.create(
			name='Pulled Place',
			city=City.VENTURA,
			venue_type=VenueType.RESTAURANT,
			address_line_1='123 Main St',
			source_name='here_places',
		)
		manual_snapshot = ListingSnapshot.objects.create(
			name='Draft Manual Place',
			city=City.OXNARD,
			venue_type=VenueType.RESTAURANT,
			address_line_1='456 Harbor Blvd',
			source_name=BusinessClaim.MANUAL_SOURCE_NAME,
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
		self.assertNotIn(manual_snapshot, queryset)
		self.assertIn(approved_manual_snapshot, queryset)

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
