from hashlib import sha256

import requests
from django.conf import settings
from django.core.cache import caches

from places.models import City, VenueType
from places.services.discovery_exclusions import get_source_excluded_businesses, get_source_excluded_external_ids
from places.services.provider_quota import consume_provider_transaction
from places.services.importers.types import ImportedPlace


class HerePlacesImporter:
	source_name = 'here_places'

	ALLOWED_CATEGORY_KEYWORDS = (
		'restaurant',
		'food',
		'drink',
		'bar',
		'pub',
		'cafe',
		'coffee',
		'bakery',
		'tea',
		'boba',
		'juice',
		'smoothie',
		'dessert',
		'ice cream',
		'donut',
		'pizza',
		'burger',
		'sandwich',
		'taco',
		'brewery',
		'brewpub',
		'tavern',
		'lounge',
		'wine',
		'sushi',
		'seafood',
		'breakfast',
		'brunch',
		'diner',
		'grill',
		'barbecue',
		'bbq',
		'steak',
		'mexican',
		'italian',
		'mediterranean',
		'asian',
		'fast food',
		'food truck',
	)
	BLOCKED_CATEGORY_KEYWORDS = (
		'fitness',
		'gym',
		'bowling',
		'recreation',
		'country club',
		'golf',
		'spa',
		'salon',
		'beauty',
		'medical',
		'church',
		'bank',
		'auto',
		'automotive',
		'repair',
		'school',
		'college',
		'hotel',
		'lodging',
		'park',
		'museum',
		'government',
		'office',
		'real estate',
		'shopping',
		'clothing',
		'pharmacy',
		'dentist',
		'health care',
		'distribution',
		'supplier',
		'wholesale',
		'manufacturer',
	)
	BLOCKED_NAME_KEYWORDS = (
		'lanes',
		'bowling',
		'club house',
		'clubhouse',
		'country club',
		'golf',
		'naval',
		'naws',
		'point mugu',
		'fitness',
		'gym',
		'spa',
		'salon',
		'church',
		'med spa',
		'wellness',
		'auto',
		'motors',
		'collision',
		'college',
		'academy',
		'medical',
		'dental',
		'warehouse',
		'distribution',
		'distributor',
		'wholesale',
		'supplier',
		'manufacturer',
		'bimbo bakeries',
		'bakeries usa',
	)
	CLOSED_STATUS_KEYWORDS = ('closed', 'temporarily closed', 'permanently closed')
	BLOCKED_ADDRESS_KEYWORDS = (
		'point mugu',
		'naws',
		'naval',
		'base',
	)

	CITY_CONFIG = {
		City.VENTURA: {'label': 'Ventura, CA', 'lat': 34.2805, 'lon': -119.2945, 'radius': 12000},
		City.OXNARD: {'label': 'Oxnard, CA', 'lat': 34.1975, 'lon': -119.1771, 'radius': 14000},
		City.CAMARILLO: {'label': 'Camarillo, CA', 'lat': 34.2164, 'lon': -119.0376, 'radius': 12000},
	}

	SEARCH_TERMS = {
		VenueType.RESTAURANT: (
			'restaurant',
			'bistro',
			'grill',
			'mexican restaurant',
			'italian restaurant',
			'seafood restaurant',
			'pizza restaurant',
			'sushi restaurant',
			'american restaurant',
			'breakfast restaurant',
			'burger restaurant',
			'asian restaurant',
			'mediterranean restaurant',
			'barbecue restaurant',
			'tapas restaurant',
			'steakhouse',
		),
		VenueType.BAR: ('bar', 'pub', 'sports bar', 'cocktail bar', 'wine bar', 'brewery', 'tavern', 'lounge', 'taproom', 'brewpub'),
		VenueType.CAFE: ('cafe', 'coffee shop', 'bakery', 'tea house', 'boba shop', 'juice bar', 'smoothie shop', 'dessert shop', 'ice cream shop', 'donut shop'),
		VenueType.FAST_FOOD: ('fast food', 'burger', 'sandwich shop', 'taco shop', 'fried chicken', 'drive thru', 'food truck', 'hot dog', 'wings'),
	}

	def __init__(self, session=None):
		self.session = session or requests.Session()
		self.allowed_cities = tuple(getattr(settings, 'BUSINESS_SOURCE_ALLOWED_CITIES', tuple(self.CITY_CONFIG.keys())))
		self.api_key = getattr(settings, 'HERE_API_KEY', '')
		self.excluded_businesses = get_source_excluded_businesses(self.source_name)
		self.excluded_external_ids = get_source_excluded_external_ids(self.source_name)

	def load_records(self, html=None):
		if html is not None:
			raise ValueError('HerePlacesImporter fetches live place data and does not accept HTML input.')

		if not self.api_key:
			return []

		records = []
		seen_ids = set()
		for city in self.allowed_cities:
			city_config = self.CITY_CONFIG.get(city)
			if not city_config:
				continue
			for venue_type, search_terms in self.SEARCH_TERMS.items():
				for search_term in search_terms:
					for item in self._fetch_city_places(city_config, search_term):
						external_id = str(item.get('id') or '').strip()
						if not external_id or external_id in seen_ids:
							continue
						if not self._should_keep_item(item, search_term=search_term):
							continue
						record = self._build_place_record(city, venue_type, item)
						if record is not None:
							seen_ids.add(external_id)
							records.append(record)
		return records

	def load_records_for_search(self, search_term, city=None, limit=20):
		if not self.api_key:
			return []

		normalized_search_term = str(search_term or '').strip()
		if not normalized_search_term:
			return []

		requested_city = str(city or '').strip().lower()
		candidate_cities = [requested_city] if requested_city else list(self.allowed_cities)
		records = []
		seen_ids = set()
		max_results = max(1, int(limit or 20))

		for candidate_city in candidate_cities:
			city_config = self.CITY_CONFIG.get(candidate_city)
			if not city_config:
				continue
			for item in self._fetch_city_places(city_config, normalized_search_term):
				external_id = str(item.get('id') or '').strip()
				if not external_id or external_id in seen_ids:
					continue
				if not self._should_keep_item(item, search_term=normalized_search_term):
					continue
				record = self._build_place_record(candidate_city, self._guess_venue_type(item, normalized_search_term), item)
				if record is None:
					continue
				seen_ids.add(external_id)
				records.append(record)
				if len(records) >= max_results:
					return records

		return records

	def _should_keep_item(self, item, search_term=''):
		external_id = f"here:{item.get('id', '')}"
		if str(external_id).strip().lower() in self.excluded_external_ids:
			return False

		city = self._resolve_item_city(item)
		name = str(item.get('title') or '').strip()
		if (self._normalize_text(city), self._normalize_text(name)) in self.excluded_businesses:
			return False

		if self._is_closed_item(item):
			return False
		if self._is_location_label_item(item):
			return False

		name_text = ' '.join(
			part
			for part in [
				str(item.get('title') or '').strip().lower(),
				str((item.get('contacts') or [{}])[0].get('www', [{}])[0].get('value') or '').strip().lower() if (item.get('contacts') or []) else '',
			]
			if part
		)
		if any(keyword in name_text for keyword in self.BLOCKED_NAME_KEYWORDS):
			return False

		address_text = ' '.join(
			part
			for part in [
				str((item.get('address') or {}).get('label') or '').strip().lower(),
				str((item.get('address') or {}).get('street') or '').strip().lower(),
			]
			if part
		)
		if any(keyword in address_text for keyword in self.BLOCKED_ADDRESS_KEYWORDS):
			return False

		category_text = self._category_text(item)
		if category_text:
			if any(keyword in category_text for keyword in self.ALLOWED_CATEGORY_KEYWORDS):
				return not any(keyword in category_text for keyword in self.BLOCKED_CATEGORY_KEYWORDS)
			return False

		fallback_text = ' '.join(
			part
			for part in [
				str(item.get('title') or '').strip().lower(),
				str(search_term or '').strip().lower(),
				str((item.get('contacts') or [{}])[0].get('www', [{}])[0].get('value') or '').strip().lower() if (item.get('contacts') or []) else '',
			]
			if part
		)
		if not fallback_text:
			return False
		return any(keyword in fallback_text for keyword in self.ALLOWED_CATEGORY_KEYWORDS)

	def _resolve_item_city(self, item):
		address = item.get('address') or {}
		for key in ('city', 'county', 'district'):
			value = str(address.get(key) or '').strip().lower()
			if value in self.CITY_CONFIG:
				return value

		address_label = str(address.get('label') or '').strip().lower()
		for city in self.CITY_CONFIG:
			if city in address_label:
				return city

		return ''

	def _normalize_text(self, value):
		return ''.join(character.lower() for character in str(value or '') if character.isalnum())

	def _category_text(self, item):
		category_names = [str(category.get('name') or '').strip().lower() for category in (item.get('categories') or []) if category.get('name')]
		food_type_names = [str(food_type.get('name') or '').strip().lower() for food_type in (item.get('foodTypes') or []) if food_type.get('name')]
		return ' '.join(part for part in [*category_names, *food_type_names] if part)

	def _guess_venue_type(self, item, search_term=''):
		category_text = ' '.join(part for part in [self._category_text(item), str(search_term or '').strip().lower()] if part)
		if any(keyword in category_text for keyword in ('bar', 'pub', 'brewery', 'tavern', 'lounge', 'wine', 'taproom', 'brewpub')):
			return VenueType.BAR
		if any(keyword in category_text for keyword in ('coffee', 'cafe', 'tea', 'boba', 'juice', 'smoothie', 'dessert', 'ice cream', 'donut', 'bakery')):
			return VenueType.CAFE
		if any(keyword in category_text for keyword in ('fast food', 'burger', 'sandwich', 'taco', 'food truck', 'wings', 'drive thru', 'fried chicken', 'hot dog')):
			return VenueType.FAST_FOOD
		return VenueType.RESTAURANT

	def _is_closed_item(self, item):
		status_parts = [
			str(item.get('businessStatus') or '').strip().lower(),
			str(item.get('closed') or '').strip().lower(),
			str(item.get('title') or '').strip().lower(),
			str((item.get('address') or {}).get('label') or '').strip().lower(),
		]
		status_text = ' '.join(part for part in status_parts if part)
		return any(keyword in status_text for keyword in self.CLOSED_STATUS_KEYWORDS)

	def _is_location_label_item(self, item):
		title = str(item.get('title') or '').strip().lower()
		if not title:
			return False
		if ', ca' in title or ', california' in title or ', united states' in title:
			return True
		address_label = str((item.get('address') or {}).get('label') or '').strip().lower()
		if address_label and title == address_label:
			return True
		for city_config in self.CITY_CONFIG.values():
			city_label = str(city_config.get('label') or '').strip().lower()
			if city_label and title == city_label:
				return True
		return False

	def _fetch_city_places(self, city_config, search_term):
		page_size = getattr(settings, 'HERE_PAGE_SIZE', 100)
		max_results = max(page_size, getattr(settings, 'HERE_MAX_RESULTS', 200))
		cache = caches[getattr(settings, 'SOURCE_FETCH_CACHE_ALIAS', 'default')]
		all_items = []
		offset = 0

		while offset < max_results:
			params = {
				'apiKey': self.api_key,
				'q': f'{search_term} in {city_config["label"]}',
				'in': f'circle:{city_config["lat"]},{city_config["lon"]};r={city_config["radius"]}',
				'limit': page_size,
				'offset': offset,
				'lang': 'en-US',
			}
			cache_input = f'{city_config["label"]}|{search_term}|{page_size}|{offset}'
			cache_key = f'here-place-discovery:{sha256(cache_input.encode("utf-8")).hexdigest()}'
			payload = cache.get(cache_key)
			if payload is None:
				if not consume_provider_transaction(self.source_name):
					break
				response = self.session.get(
					getattr(settings, 'HERE_DISCOVERY_URL', 'https://discover.search.hereapi.com/v1/discover'),
					params=params,
					headers={'Accept': 'application/json', 'User-Agent': getattr(settings, 'HERE_USER_AGENT', 'HappyHourApp/1.0')},
					timeout=getattr(settings, 'HERE_TIMEOUT', 20),
				)
				response.raise_for_status()
				payload = response.json()
				cache_timeout = getattr(settings, 'HERE_CACHE_TIMEOUT', 3600)
				if cache_timeout and cache_timeout > 0:
					cache.set(cache_key, payload, cache_timeout)

			batch = payload.get('items', [])
			all_items.extend(batch)
			if len(batch) < page_size:
				break
			offset += page_size

		return all_items

	def _build_place_record(self, city, venue_type, item):
		name = str(item.get('title') or '').strip()
		if not name:
			return None

		address = item.get('address') or {}
		position = item.get('position') or {}
		contacts = item.get('contacts') or []
		first_contact = contacts[0] if contacts else {}
		phone_entries = first_contact.get('phone') or []
		web_entries = first_contact.get('www') or []
		phone_number = str(phone_entries[0].get('value') if phone_entries else '').strip()
		website_url = str(web_entries[0].get('value') if web_entries else '').strip()
		house_number = str(address.get('houseNumber') or '').strip()
		street_name = str(address.get('street') or '').strip()
		address_label = str(address.get('label') or '').strip()
		label_first_segment = str(address_label.split(',')[0] or '').strip()
		full_street_address = ' '.join(part for part in [house_number, street_name] if part).strip()
		if full_street_address and label_first_segment.lower().startswith(full_street_address.lower()):
			resolved_address_line_1 = label_first_segment
		else:
			resolved_address_line_1 = full_street_address or address_label

		return ImportedPlace(
			name=name,
			city=city,
			venue_type=venue_type,
			address_line_1=resolved_address_line_1,
			neighborhood=str(address.get('district') or '').strip(),
			state=str(address.get('stateCode') or 'CA').strip() or 'CA',
			postal_code=str(address.get('postalCode') or '').strip(),
			geocode_query=', '.join(part for part in [name, self.CITY_CONFIG.get(city, {}).get('label', ''), 'CA'] if part),
			phone_number=phone_number,
			website_url=website_url,
			latitude=position.get('lat'),
			longitude=position.get('lng'),
			external_id=f"here:{item.get('id', '')}",
			source_name=self.source_name,
			source_url=str(item.get('href') or website_url).strip(),
		)