from hashlib import sha256

import requests
from django.conf import settings
from django.core.cache import caches

from places.models import City, VenueType
from places.services.importers.types import ImportedPlace


class YelpFusionPlacesImporter:
	source_name = 'yelp_fusion_places'

	CITY_QUERY_NAMES = {
		City.VENTURA: 'Ventura, CA',
		City.OXNARD: 'Oxnard, CA',
		City.CAMARILLO: 'Camarillo, CA',
	}

	SEARCH_CATEGORIES = {
		VenueType.RESTAURANT: ('restaurants',),
		VenueType.BAR: ('bars', 'pubs', 'beerbar', 'cocktailbars', 'wine_bars', 'sportsbars'),
		VenueType.CAFE: ('cafes', 'coffee', 'tea'),
		VenueType.FAST_FOOD: ('burgers', 'hotdogs', 'sandwiches', 'pizza', 'chicken_wings', 'fastfood'),
	}

	def __init__(self, session=None):
		self.session = session or requests.Session()
		self.allowed_cities = tuple(getattr(settings, 'BUSINESS_SOURCE_ALLOWED_CITIES', tuple(self.CITY_QUERY_NAMES.keys())))
		self.api_key = getattr(settings, 'YELP_FUSION_API_KEY', '')

	def load_records(self, html=None):
		if html is not None:
			raise ValueError('YelpFusionPlacesImporter fetches live place data and does not accept HTML input.')

		if not self.api_key:
			return []

		records = []
		seen_ids = set()
		for city in self.allowed_cities:
			city_query_name = self.CITY_QUERY_NAMES.get(city)
			if not city_query_name:
				continue
			for venue_type, categories in self.SEARCH_CATEGORIES.items():
				for business in self._fetch_city_businesses(city_query_name, categories):
					external_id = str(business.get('id') or '').strip()
					if not external_id or external_id in seen_ids:
						continue
					record = self._build_place_record(city, venue_type, business)
					if record is not None:
						seen_ids.add(external_id)
						records.append(record)
		return records

	def _fetch_city_businesses(self, city_query_name, categories):
		page_size = getattr(settings, 'YELP_FUSION_PAGE_SIZE', 50)
		max_results = max(page_size, getattr(settings, 'YELP_FUSION_MAX_RESULTS', 150))
		cache = caches[getattr(settings, 'SOURCE_FETCH_CACHE_ALIAS', 'default')]
		all_businesses = []
		offset = 0

		while offset < max_results:
			params = {
				'location': city_query_name,
				'categories': ','.join(categories),
				'limit': page_size,
				'offset': offset,
				'sort_by': 'best_match',
			}
			cache_input = f'{city_query_name}|{params["categories"]}|{page_size}|{offset}'
			cache_key = f'yelp-place-discovery:{sha256(cache_input.encode("utf-8")).hexdigest()}'
			payload = cache.get(cache_key)
			if payload is None:
				response = self.session.get(
					getattr(settings, 'YELP_FUSION_API_URL', 'https://api.yelp.com/v3/businesses/search'),
					params=params,
					headers={
						'Authorization': f'Bearer {self.api_key}',
						'Accept': 'application/json',
						'User-Agent': getattr(settings, 'OSM_PLACE_DISCOVERY_USER_AGENT', 'HappyHourApp/1.0'),
					},
					timeout=getattr(settings, 'YELP_FUSION_TIMEOUT', 20),
				)
				response.raise_for_status()
				payload = response.json()
				cache_timeout = getattr(settings, 'YELP_FUSION_CACHE_TIMEOUT', 3600)
				if cache_timeout and cache_timeout > 0:
					cache.set(cache_key, payload, cache_timeout)

			batch = payload.get('businesses', [])
			all_businesses.extend(batch)
			if len(batch) < page_size:
				break
			offset += page_size

		return all_businesses

	def _build_place_record(self, city, venue_type, business):
		if business.get('is_closed'):
			return None

		name = str(business.get('name') or '').strip()
		if not name:
			return None

		location = business.get('location') or {}
		coordinates = business.get('coordinates') or {}
		latitude = coordinates.get('latitude')
		longitude = coordinates.get('longitude')

		try:
			latitude = float(latitude) if latitude is not None else None
			longitude = float(longitude) if longitude is not None else None
		except (TypeError, ValueError):
			latitude = None
			longitude = None

		return ImportedPlace(
			name=name,
			city=city,
			venue_type=venue_type,
			address_line_1=str(location.get('address1') or '').strip(),
			address_line_2=str(location.get('address2') or '').strip(),
			neighborhood=', '.join(location.get('display_address', [])[1:-1]) if location.get('display_address') else '',
			state=str(location.get('state') or 'CA').strip() or 'CA',
			postal_code=str(location.get('zip_code') or '').strip(),
			geocode_query=', '.join(part for part in [name, self.CITY_QUERY_NAMES.get(city, ''), 'CA'] if part),
			phone_number=str(business.get('display_phone') or business.get('phone') or '').strip(),
			website_url='',
			latitude=latitude,
			longitude=longitude,
			external_id=f"yelp:{business.get('id', '')}",
			source_name=self.source_name,
			source_url=str(business.get('url') or '').strip(),
		)