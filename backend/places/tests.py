from io import StringIO
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.admin.sites import AdminSite
from django.core.cache import caches
from django.core.management import call_command
from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase
from bs4 import BeautifulSoup

from .admin import BusinessAccountAdmin, CustomerAccountAdmin
from .models import BusinessAccount, BusinessClaim, BusinessMembership, City, CustomerAccount, DealType, ListingSnapshot, VenueType, Weekday
from .services.importers.base import BaseHtmlImporter
from .services.importers.business_websites import BusinessWebsiteImporter
from .services.importers.types import ImportedDeal, ImportedHappyHour, ImportedOperatingHour, ImportedPlace
from .services.source_listings import _build_deal_identity_key, _build_place_payload, get_source_place_payloads


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
			'is_active': True,
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

	def test_place_detail_includes_deals(self):
		with patch('places.views.get_source_place_payload', return_value=self.place_payload):
			response = self.client.get(reverse('place-detail', kwargs={'slug': self.place_payload['slug']}))

		self.assertEqual(response.status_code, 200)
		self.assertEqual(len(response.json()['deals']), 1)

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
		self.assertIn('Fetched 1 places, 1 deals, and 2 happy hour windows from website sources.', output.getvalue())


class BusinessWebsiteImporterTests(TestCase):
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
		self.assertEqual(payloads[0]['name'], 'Lure Fish House')
		self.assertEqual(len(payloads[0]['locations']), 2)
		self.assertEqual({location['city'] for location in payloads[0]['locations']}, {City.VENTURA, City.CAMARILLO})
		self.assertEqual(payloads[0]['locations'][0]['image_urls'], ['https://example.com/lure-camarillo-1.jpg'])


@override_settings(
	CACHES={
		'default': {
			'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
			'LOCATION': 'test-source-fetch-cache',
		}
	},
	SOURCE_FETCH_CACHE_TIMEOUT=60,
)
class SourceFetchCacheTests(TestCase):
	def setUp(self):
		caches['default'].clear()

	def tearDown(self):
		caches['default'].clear()

	def test_fetch_html_reuses_cached_source_response(self):
		session = CountingSession('<html>live source payload</html>')
		first_importer = DummyImporter(session=session)
		second_importer = DummyImporter(session=session)

		first_response = first_importer.fetch_html()
		second_response = second_importer.fetch_html()

		self.assertEqual(first_response, '<html>live source payload</html>')
		self.assertEqual(second_response, '<html>live source payload</html>')
		self.assertEqual(len(session.calls), 1)


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
			job_title='General Manager',
			work_email='jane.manager@yardhouse.com',
			work_phone='805-555-0101',
			verification_summary='I manage the Yard House location and can verify store promotions.',
			status=BusinessClaim.Status.SUBMITTED,
		)

		membership = claim.approve(reviewed_by=self.reviewer, reviewer_notes='Verified through manual review.')

		claim.refresh_from_db()
		self.assertEqual(claim.status, BusinessClaim.Status.APPROVED)
		self.assertEqual(claim.reviewed_by, self.reviewer)
		self.assertEqual(BusinessMembership.objects.count(), 1)
		self.assertEqual(membership.user, self.user)
		self.assertEqual(membership.claim, claim)
		self.assertTrue(membership.is_active)

	def test_draft_claim_cannot_be_approved(self):
		claim = BusinessClaim.objects.create(
			claimant=self.user,
			listing_snapshot=self.snapshot,
			contact_name='Jane Manager',
			job_title='General Manager',
			work_email='jane.manager@yardhouse.com',
			verification_summary='I manage the location.',
		)

		with self.assertRaises(ValidationError):
			claim.approve(reviewed_by=self.reviewer)


class AccountProxyTests(APITestCase):
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
			['business_owner', 'regular_customer'],
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

	def test_customer_account_admin_shows_applicant_summary(self):
		business_user = User.objects.create_user(username='claiming_customer', email='claiming@example.com', password='test-pass-123')
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
		applicant = CustomerAccount.objects.get(username='claiming_customer')

		self.assertEqual(admin_instance.account_pathway(applicant), 'Business applicant')
		self.assertEqual(admin_instance.claim_status(applicant), 'Pending claim')
		self.assertEqual(admin_instance.claimed_businesses(applicant), 'Claimed Place')
