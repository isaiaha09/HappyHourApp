from bs4 import BeautifulSoup

from places.models import City, DealType, VenueType, Weekday
from places.services.importers.base import BaseHtmlImporter
from places.services.importers.types import ImportedDeal, ImportedHappyHour, ImportedPlace


class ExampleHtmlImporter(BaseHtmlImporter):
	source_name = 'example_html'
	source_url = 'https://example.com/happy-hour'

	CITY_MAP = {
		'ventura': City.VENTURA,
		'oxnard': City.OXNARD,
		'camarillo': City.CAMARILLO,
	}

	VENUE_TYPE_MAP = {
		'restaurant': VenueType.RESTAURANT,
		'fast_food': VenueType.FAST_FOOD,
		'bar': VenueType.BAR,
		'cafe': VenueType.CAFE,
		'shop': VenueType.SHOP,
		'attraction': VenueType.ATTRACTION,
		'other': VenueType.OTHER,
	}

	DEAL_TYPE_MAP = {
		'happy_hour': DealType.HAPPY_HOUR,
		'daily_special': DealType.DAILY_SPECIAL,
		'discount': DealType.DISCOUNT,
		'limited_time': DealType.LIMITED_TIME,
		'other': DealType.OTHER,
	}

	WEEKDAY_MAP = {
		'monday': Weekday.MONDAY,
		'tuesday': Weekday.TUESDAY,
		'wednesday': Weekday.WEDNESDAY,
		'thursday': Weekday.THURSDAY,
		'friday': Weekday.FRIDAY,
		'saturday': Weekday.SATURDAY,
		'sunday': Weekday.SUNDAY,
	}

	def parse_html(self, html):
		soup = BeautifulSoup(html, 'html.parser')
		records = []

		for venue_node in soup.select('[data-venue]'):
			city = self._map_required(self.CITY_MAP, venue_node.get('data-city'), 'city')
			venue_type = self._map_required(self.VENUE_TYPE_MAP, venue_node.get('data-venue-type'), 'venue_type')
			deals = []

			for deal_node in venue_node.select('[data-deal]'):
				deal_type = self._map_required(self.DEAL_TYPE_MAP, deal_node.get('data-deal-type'), 'deal_type')
				happy_hours = []
				for happy_hour_node in deal_node.select('[data-happy-hour]'):
					weekday = self._map_required(self.WEEKDAY_MAP, happy_hour_node.get('data-weekday'), 'weekday')
					happy_hours.append(
						ImportedHappyHour(
							weekday=weekday,
							start_time=happy_hour_node.get('data-start-time', ''),
							end_time=happy_hour_node.get('data-end-time', ''),
							all_day=happy_hour_node.get('data-all-day', 'false').lower() == 'true',
						)
					)

				deals.append(
					ImportedDeal(
						title=self._required_text(deal_node, 'title'),
						deal_type=deal_type,
						description=self._optional_text(deal_node, 'description'),
						price_text=self._optional_text(deal_node, 'price_text'),
						terms=self._optional_text(deal_node, 'terms'),
						external_id=deal_node.get('data-external-id', '').strip(),
						source_name=self.source_name,
						source_url=deal_node.get('data-source-url', '').strip(),
						happy_hours=happy_hours,
					)
				)

			records.append(
				ImportedPlace(
					name=self._required_text(venue_node, 'name'),
					city=city,
					venue_type=venue_type,
					address_line_1=self._required_text(venue_node, 'address_line_1'),
					address_line_2=self._optional_text(venue_node, 'address_line_2'),
					neighborhood=self._optional_text(venue_node, 'neighborhood'),
					postal_code=self._optional_text(venue_node, 'postal_code'),
					phone_number=self._optional_text(venue_node, 'phone_number'),
					website_url=self._optional_text(venue_node, 'website_url'),
					external_id=venue_node.get('data-external-id', '').strip(),
					source_name=self.source_name,
					source_url=venue_node.get('data-source-url', '').strip(),
					deals=deals,
				)
			)

		return records

	def _required_text(self, node, field_name):
		value = self._optional_text(node, field_name)
		if not value:
			raise ValueError(f'Missing required field: {field_name}')
		return value

	def _optional_text(self, node, field_name):
		field = node.select_one(f'[data-field="{field_name}"]')
		return field.get_text(strip=True) if field else ''

	def _map_required(self, mapping, raw_value, field_name):
		key = (raw_value or '').strip().lower()
		if key not in mapping:
			raise ValueError(f'Unsupported {field_name}: {raw_value}')
		return mapping[key]