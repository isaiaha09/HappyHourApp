from hashlib import sha256

import requests
from django.conf import settings
from django.core.cache import caches

from places.models import City, VenueType
from places.services.discovery_exclusions import get_source_excluded_businesses, get_source_excluded_external_ids
from places.services.importers.business_websites import BusinessWebsiteImporter
from places.services.importers.here_places import HerePlacesImporter
from places.services.importers.tomtom_places import TomTomPlacesImporter
from places.services.importers.types import ImportedPlace
from places.services.provider_quota import select_discovery_provider


class OpenStreetMapPlacesImporter:
	source_name = 'openstreetmap_places'
	overpass_url = 'https://overpass-api.de/api/interpreter'
	INACTIVE_LIFECYCLE_PREFIXES = ('abandoned', 'closed', 'demolished', 'disused', 'former', 'was')
	INACTIVE_STATUS_VALUES = {'abandoned', 'closed', 'demolished', 'disused', 'former', 'no', 'permanently closed'}

	CITY_QUERY_NAMES = {
		City.VENTURA: 'Ventura',
		City.OXNARD: 'Oxnard',
		City.CAMARILLO: 'Camarillo',
	}

	AMENITY_TO_VENUE_TYPE = {
		'restaurant': VenueType.RESTAURANT,
		'fast_food': VenueType.FAST_FOOD,
		'bar': VenueType.BAR,
		'pub': VenueType.BAR,
		'biergarten': VenueType.BAR,
		'cafe': VenueType.CAFE,
	}

	def __init__(self, session=None):
		self.session = session or requests.Session()
		self.allowed_cities = tuple(getattr(settings, 'BUSINESS_SOURCE_ALLOWED_CITIES', tuple(self.CITY_QUERY_NAMES.keys())))
		self.excluded_businesses = get_source_excluded_businesses(self.source_name)
		self.excluded_external_ids = get_source_excluded_external_ids(self.source_name)

	def load_records(self, html=None):
		if html is not None:
			raise ValueError('OpenStreetMapPlacesImporter fetches live place data and does not accept HTML input.')

		records = []
		for city in self.allowed_cities:
			city_query_name = self.CITY_QUERY_NAMES.get(city)
			if not city_query_name:
				continue
			for element in self._fetch_city_elements(city_query_name):
				record = self._build_place_record(city, element)
				if record is not None:
					records.append(record)
		return records

	def _fetch_city_elements(self, city_query_name):
		query = self._build_overpass_query(city_query_name)
		cache = caches[getattr(settings, 'SOURCE_FETCH_CACHE_ALIAS', 'default')]
		cache_key = f'osm-place-discovery:{sha256(query.encode("utf-8")).hexdigest()}'
		cached_payload = cache.get(cache_key)
		if cached_payload is None:
			response = self.session.post(
				getattr(settings, 'OSM_PLACE_DISCOVERY_URL', self.overpass_url),
				data=query,
				headers={
					'User-Agent': getattr(settings, 'OSM_PLACE_DISCOVERY_USER_AGENT', 'HappyHourApp/1.0'),
				},
				timeout=getattr(settings, 'OSM_PLACE_DISCOVERY_TIMEOUT', 45),
			)
			response.raise_for_status()
			cached_payload = response.json()
			cache_timeout = getattr(settings, 'OSM_PLACE_DISCOVERY_CACHE_TIMEOUT', 3600)
			if cache_timeout and cache_timeout > 0:
				cache.set(cache_key, cached_payload, cache_timeout)

		return cached_payload.get('elements', [])

	def _build_overpass_query(self, city_query_name):
		return f'''[out:json][timeout:25];
area["name"="{city_query_name}"]["boundary"="administrative"]["admin_level"="8"]->.searchArea;
(
  nwr["amenity"~"^(restaurant|fast_food|bar|pub|biergarten|cafe)$"](area.searchArea);
);
out center tags;'''

	def _build_place_record(self, city, element):
		tags = element.get('tags') or {}
		name = str(tags.get('name', '')).strip()
		external_id = f"osm:{element.get('type', 'unknown')}:{element.get('id', '')}"
		if not self._is_active_business(city, name, tags, external_id):
			return None

		amenity = str(tags.get('amenity', '')).strip().lower()
		venue_type = self.AMENITY_TO_VENUE_TYPE.get(amenity)
		if not name or venue_type is None:
			return None

		address_line_1 = self._build_address_line_1(tags)
		phone_number = str(tags.get('contact:phone') or tags.get('phone') or '').strip()
		website_url = str(tags.get('contact:website') or tags.get('website') or tags.get('url') or '').strip()
		if not self._passes_quality_threshold(tags, address_line_1, phone_number, website_url):
			return None

		latitude, longitude = self._extract_coordinates(element)
		return ImportedPlace(
			name=name,
			city=city,
			venue_type=venue_type,
			address_line_1=address_line_1,
			neighborhood=str(tags.get('addr:suburb') or tags.get('addr:neighbourhood') or '').strip(),
			state='CA',
			postal_code=str(tags.get('addr:postcode') or '').strip(),
			geocode_query=', '.join(part for part in [name, self.CITY_QUERY_NAMES.get(city, ''), 'CA'] if part),
			phone_number=phone_number,
			website_url=website_url,
			latitude=latitude,
			longitude=longitude,
			external_id=external_id,
			source_name=self.source_name,
			source_url=self._build_source_url(element),
		)

	def _extract_coordinates(self, element):
		latitude = element.get('lat')
		longitude = element.get('lon')
		center = element.get('center') or {}
		if latitude is None:
			latitude = center.get('lat')
		if longitude is None:
			longitude = center.get('lon')

		try:
			return (float(latitude), float(longitude))
		except (TypeError, ValueError):
			return (None, None)

	def _build_source_url(self, element):
		element_type = str(element.get('type') or 'node').strip() or 'node'
		element_id = element.get('id')
		return f'https://www.openstreetmap.org/{element_type}/{element_id}' if element_id else 'https://www.openstreetmap.org/'

	def _build_address_line_1(self, tags):
		full_address = str(tags.get('addr:full') or '').strip()
		if full_address:
			return full_address

		house_number = str(tags.get('addr:housenumber') or '').strip()
		street = str(tags.get('addr:street') or '').strip()
		if house_number and street:
			return f'{house_number} {street}'
		return street or str(tags.get('addr:block_number') or '').strip()

	def _is_active_business(self, city, name, tags, external_id):
		if not name:
			return False

		if str(external_id).strip().lower() in self.excluded_external_ids:
			return False

		if (self._normalize_text(city), self._normalize_text(name)) in self.excluded_businesses:
			return False

		text_fields = [
			str(tags.get('description') or ''),
			str(tags.get('note') or ''),
			str(tags.get('opening_hours') or ''),
			str(tags.get('disused') or ''),
			str(tags.get('status') or ''),
		]
		combined_text = ' '.join(text_fields).lower()
		if 'permanently closed' in combined_text or 'closed permanently' in combined_text:
			return False

		for raw_key, raw_value in tags.items():
			key = str(raw_key or '').strip().lower()
			value = str(raw_value or '').strip().lower()
			if not key:
				continue

			if key in self.INACTIVE_LIFECYCLE_PREFIXES and value in self.INACTIVE_STATUS_VALUES:
				return False

			if any(key.startswith(f'{prefix}:') for prefix in self.INACTIVE_LIFECYCLE_PREFIXES):
				return False

			if key in {'opening_hours', 'status', 'operational_status'} and value in self.INACTIVE_STATUS_VALUES:
				return False

		return True

	def _passes_quality_threshold(self, tags, address_line_1, phone_number, website_url):
		score = 0
		if address_line_1:
			score += 1
		if phone_number:
			score += 1
		if website_url:
			score += 1
		if str(tags.get('opening_hours') or '').strip():
			score += 1
		if str(tags.get('cuisine') or '').strip():
			score += 1

		return score >= getattr(settings, 'OSM_PLACE_MIN_METADATA_SCORE', 2)

	def _normalize_text(self, value):
		return ''.join(character.lower() for character in str(value or '') if character.isalnum())


class HybridPlacesImporter:
	source_name = 'hybrid_places'

	def __init__(self, session=None, website_importer=None, here_importer=None, tomtom_importer=None, osm_importer=None):
		self.website_importer = website_importer or BusinessWebsiteImporter(session=session)
		self.here_importer = here_importer or HerePlacesImporter(session=session)
		self.tomtom_importer = tomtom_importer or TomTomPlacesImporter(session=session)
		self.osm_importer = osm_importer or OpenStreetMapPlacesImporter(session=session)

	def load_records(self, html=None):
		if html is not None:
			raise ValueError('HybridPlacesImporter composes multiple live sources and does not accept HTML input.')

		website_records = list(self.website_importer.load_records())
		discovery_records = list(self._select_discovery_importer().load_records())
		filtered_discovery_records = self._filter_duplicate_records(discovery_records, website_records)
		return website_records + self._enrich_discovery_records(filtered_discovery_records)

	def _enrich_discovery_records(self, discovery_records):
		enrich_place_records = getattr(self.website_importer, 'enrich_place_records', None)
		if enrich_place_records is None:
			return discovery_records
		return list(enrich_place_records(discovery_records))

	def _select_discovery_importer(self):
		provider_name = select_discovery_provider()
		if provider_name == self.here_importer.source_name:
			return self.here_importer
		if provider_name == self.tomtom_importer.source_name:
			return self.tomtom_importer
		return self.osm_importer

	def _filter_duplicate_records(self, candidate_records, existing_records):
		existing_name_keys = {self._normalize_name_key(record) for record in existing_records if self._normalize_name_key(record)}
		existing_address_keys = {self._normalize_address_key(record) for record in existing_records if self._normalize_address_key(record)}
		filtered_records = []

		for record in candidate_records:
			name_key = self._normalize_name_key(record)
			address_key = self._normalize_address_key(record)
			if name_key and name_key in existing_name_keys:
				continue
			if address_key and address_key in existing_address_keys:
				continue
			filtered_records.append(record)
			if name_key:
				existing_name_keys.add(name_key)
			if address_key:
				existing_address_keys.add(address_key)

		return filtered_records

	def _normalize_name_key(self, record):
		name = ''.join(character.lower() for character in str(record.name) if character.isalnum())
		city = str(record.city or '').strip().lower()
		if not name or not city:
			return ''
		return f'{city}:{name}'

	def _normalize_address_key(self, record):
		address = ''.join(character.lower() for character in str(record.address_line_1 or '') if character.isalnum())
		city = str(record.city or '').strip().lower()
		if not address or not city:
			return ''
		return f'{city}:{address}'