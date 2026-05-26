from hashlib import sha256

import requests
from django.conf import settings
from django.core.cache import caches

from places.models import City, VenueType
from places.services.provider_quota import consume_provider_transaction
from places.services.importers.types import ImportedPlace


class TomTomPlacesImporter:
	source_name = 'tomtom_places'

	CITY_CONFIG = {
		City.VENTURA: {'label': 'Ventura, CA', 'lat': 34.2805, 'lon': -119.2945, 'radius': 12000},
		City.OXNARD: {'label': 'Oxnard, CA', 'lat': 34.1975, 'lon': -119.1771, 'radius': 14000},
		City.CAMARILLO: {'label': 'Camarillo, CA', 'lat': 34.2164, 'lon': -119.0376, 'radius': 12000},
	}

	SEARCH_TERMS = {
		VenueType.RESTAURANT: ('restaurant',),
		VenueType.BAR: ('bar', 'pub'),
		VenueType.CAFE: ('cafe', 'coffee'),
		VenueType.FAST_FOOD: ('fast food', 'burger'),
	}

	def __init__(self, session=None):
		self.session = session or requests.Session()
		self.allowed_cities = tuple(getattr(settings, 'BUSINESS_SOURCE_ALLOWED_CITIES', tuple(self.CITY_CONFIG.keys())))
		self.api_key = getattr(settings, 'TOMTOM_API_KEY', '')

	def load_records(self, html=None):
		if html is not None:
			raise ValueError('TomTomPlacesImporter fetches live place data and does not accept HTML input.')

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
						record = self._build_place_record(city, venue_type, item)
						if record is not None:
							seen_ids.add(external_id)
							records.append(record)
		return records

	def _fetch_city_places(self, city_config, search_term):
		page_size = getattr(settings, 'TOMTOM_PAGE_SIZE', 100)
		max_results = max(page_size, getattr(settings, 'TOMTOM_MAX_RESULTS', 200))
		cache = caches[getattr(settings, 'SOURCE_FETCH_CACHE_ALIAS', 'default')]
		all_results = []
		offset = 0

		while offset < max_results:
			params = {
				'key': self.api_key,
				'limit': page_size,
				'ofs': offset,
				'lat': city_config['lat'],
				'lon': city_config['lon'],
				'radius': city_config['radius'],
				'countrySet': 'US',
			}
			cache_input = f'{city_config["label"]}|{search_term}|{page_size}|{offset}'
			cache_key = f'tomtom-place-discovery:{sha256(cache_input.encode("utf-8")).hexdigest()}'
			payload = cache.get(cache_key)
			if payload is None:
				if not consume_provider_transaction(self.source_name):
					break
				endpoint = getattr(settings, 'TOMTOM_CATEGORY_SEARCH_URL', 'https://api.tomtom.com/search/2/categorySearch/{query}.json').format(query=search_term)
				response = self.session.get(
					endpoint,
					params=params,
					headers={'Accept': 'application/json', 'User-Agent': getattr(settings, 'TOMTOM_USER_AGENT', 'HappyHourApp/1.0')},
					timeout=getattr(settings, 'TOMTOM_TIMEOUT', 20),
				)
				response.raise_for_status()
				payload = response.json()
				cache_timeout = getattr(settings, 'TOMTOM_CACHE_TIMEOUT', 3600)
				if cache_timeout and cache_timeout > 0:
					cache.set(cache_key, payload, cache_timeout)

			batch = payload.get('results', [])
			all_results.extend(batch)
			if len(batch) < page_size:
				break
			offset += page_size

		return all_results

	def _build_place_record(self, city, venue_type, item):
		poi = item.get('poi') or {}
		address = item.get('address') or {}
		position = item.get('position') or {}
		name = str(poi.get('name') or '').strip()
		if not name:
			return None

		return ImportedPlace(
			name=name,
			city=city,
			venue_type=venue_type,
			address_line_1=self._build_address_line_1(address),
			neighborhood=str(address.get('municipalitySubdivision') or address.get('neighbourhood') or '').strip(),
			state=str(address.get('countrySubdivision') or 'CA').strip() or 'CA',
			postal_code=str(address.get('postalCode') or '').strip(),
			geocode_query=', '.join(part for part in [name, self.CITY_CONFIG.get(city, {}).get('label', ''), 'CA'] if part),
			phone_number=str(poi.get('phone') or '').strip(),
			website_url=str(poi.get('url') or '').strip(),
			latitude=position.get('lat'),
			longitude=position.get('lon'),
			external_id=f"tomtom:{item.get('id', '')}",
			source_name=self.source_name,
			source_url=str(poi.get('url') or '').strip(),
		)

	def _build_address_line_1(self, address):
		street_number = str(address.get('streetNumber') or '').strip()
		street_name = str(address.get('streetName') or '').strip()
		if street_number and street_name:
			return f'{street_number} {street_name}'
		return street_name or str(address.get('freeformAddress') or '').strip()