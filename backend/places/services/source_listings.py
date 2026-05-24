from hashlib import sha256
from urllib.parse import urlparse

import requests
from django.conf import settings
from django.core.cache import caches
from django.core.exceptions import ImproperlyConfigured
from django.utils.text import slugify

from places.models import City, DealType, VenueType, Weekday
from places.services.importers.business_websites import BusinessWebsiteImporter
from places.services.importers.example_html import ExampleHtmlImporter


RUNTIME_IMPORTER_REGISTRY = {
	'business_websites': BusinessWebsiteImporter,
	'example_html': ExampleHtmlImporter,
}


def get_listing_source_name():
	return getattr(settings, 'LISTING_SOURCE_NAME', 'business_websites')


def get_listing_importer(source_name=None):
	resolved_source_name = source_name or get_listing_source_name()
	importer_class = RUNTIME_IMPORTER_REGISTRY.get(resolved_source_name)
	if importer_class is None:
		raise ImproperlyConfigured(f'Unsupported listing source: {resolved_source_name}')
	return importer_class()


def load_source_records(source_name=None):
	return get_listing_importer(source_name=source_name).load_records()


def get_source_place_payloads(city=None, venue_type=None, source_name=None):
	payloads = []
	for place_records in _group_source_records(load_source_records(source_name=source_name)).values():
		payload = _build_grouped_place_payload(place_records, preferred_city=city)
		if payload is None:
			continue
		if city and city not in {location['city'] for location in payload['locations']}:
			continue
		if venue_type and payload['venue_type'] != venue_type:
			continue
		payloads.append(payload)

	return sorted(payloads, key=lambda payload: (payload['name'], payload['city_label']))


def get_source_place_payload(slug, source_name=None):
	for payload in get_source_place_payloads(source_name=source_name):
		if payload['slug'] == slug:
			return payload
	return None


def get_source_deal_payloads(city=None, deal_type=None, source_name=None):
	payloads = []
	for place_record in load_source_records(source_name=source_name):
		if not place_record.is_active:
			continue
		if city and place_record.city != city:
			continue

		place_slug = _build_place_slug(place_record)
		for deal_record in place_record.deals:
			if not deal_record.is_active:
				continue
			if deal_type and deal_record.deal_type != deal_type:
				continue
			payloads.append(_build_deal_payload(place_record, deal_record, place_slug))

	return sorted(payloads, key=lambda payload: (payload['place_name'], payload['title']))


def _build_place_payload(place_record):
	return _build_grouped_place_payload([place_record])


def _group_source_records(place_records):
	grouped_records = {}
	for place_record in place_records:
		if not place_record.is_active:
			continue
		grouped_records.setdefault(_build_profile_key(place_record), []).append(place_record)
	return grouped_records


def _build_grouped_place_payload(place_records, preferred_city=None):
	if not place_records:
		return None

	location_payloads = [_build_location_payload(place_record) for place_record in place_records]
	location_payloads.sort(key=lambda location: (location['city_label'], location['address_line_1'], location['id']))
	primary_location = _select_primary_location(location_payloads, preferred_city)
	profile_name = _profile_name_for_record(place_records[0])
	profile_slug = _build_profile_slug(place_records[0])

	return {
		'id': _stable_numeric_id(place_records[0].source_name, profile_slug, profile_name),
		'name': profile_name,
		'slug': profile_slug,
		'city': primary_location['city'],
		'city_label': primary_location['city_label'],
		'venue_type': place_records[0].venue_type,
		'venue_type_label': _label_for_choice(VenueType, place_records[0].venue_type),
		'address_line_1': primary_location['address_line_1'],
		'address_line_2': primary_location['address_line_2'],
		'neighborhood': primary_location['neighborhood'],
		'state': primary_location['state'],
		'postal_code': primary_location['postal_code'],
		'latitude': primary_location['latitude'],
		'longitude': primary_location['longitude'],
		'phone_number': primary_location['phone_number'],
		'website_url': primary_location['website_url'],
		'image_urls': primary_location['image_urls'],
		'operating_hours': primary_location['operating_hours'],
		'is_active': any(place_record.is_active for place_record in place_records),
		'deals': primary_location['deals'],
		'locations': location_payloads,
	}


def _build_location_payload(place_record):
	place_slug = _build_place_slug(place_record)
	latitude, longitude = _get_place_coordinates(place_record)
	return {
		'id': _stable_numeric_id(place_record.source_name, place_record.external_id, place_record.name, place_record.city),
		'slug': place_slug,
		'name': place_record.name,
		'city': place_record.city,
		'city_label': _label_for_choice(City, place_record.city),
		'venue_type': place_record.venue_type,
		'venue_type_label': _label_for_choice(VenueType, place_record.venue_type),
		'address_line_1': place_record.address_line_1,
		'address_line_2': place_record.address_line_2,
		'neighborhood': place_record.neighborhood,
		'state': place_record.state,
		'postal_code': place_record.postal_code,
		'latitude': latitude,
		'longitude': longitude,
		'phone_number': place_record.phone_number,
		'website_url': place_record.website_url,
		'image_urls': list(place_record.image_urls),
		'operating_hours': [
			{
				'id': _stable_numeric_id(place_record.source_name, place_slug, 'operating-hours', operating_hour.weekday, operating_hour.open_time, operating_hour.close_time),
				'weekday': operating_hour.weekday,
				'weekday_label': _label_for_choice(Weekday, operating_hour.weekday),
				'open_time': operating_hour.open_time,
				'close_time': operating_hour.close_time,
			}
			for operating_hour in getattr(place_record, 'operating_hours', [])
		],
		'is_active': place_record.is_active,
		'deals': [
			_build_deal_payload(place_record, deal_record, place_slug)
			for deal_record in place_record.deals
			if deal_record.is_active
		],
	}


def _select_primary_location(location_payloads, preferred_city=None):
	if preferred_city:
		for location in location_payloads:
			if location['city'] == preferred_city:
				return location
	return location_payloads[0]


def _get_place_coordinates(place_record):
	queries = _build_geocode_queries(place_record)
	if not queries:
		return (None, None)

	cache = caches[getattr(settings, 'SOURCE_FETCH_CACHE_ALIAS', 'default')]
	for query in queries:
		cache_key = f"place-geocode:{sha256(query.encode('utf-8')).hexdigest()}"
		cached_coordinates = cache.get(cache_key)
		if cached_coordinates is not None:
			if cached_coordinates != (None, None):
				return cached_coordinates
			continue

		coordinates = _fetch_place_coordinates(query)
		cache.set(cache_key, coordinates, getattr(settings, 'PLACE_GEOCODE_CACHE_TIMEOUT', 86400))
		if coordinates != (None, None):
			return coordinates

	return (None, None)


def _fetch_place_coordinates(full_address):
	try:
		response = requests.get(
			getattr(settings, 'PLACE_GEOCODE_URL', 'https://nominatim.openstreetmap.org/search'),
			params={
				'q': full_address,
				'format': 'jsonv2',
				'limit': 1,
				'countrycodes': 'us',
			},
			headers={
				'User-Agent': getattr(settings, 'PLACE_GEOCODE_USER_AGENT', 'HappyHourApp/1.0'),
			},
			timeout=getattr(settings, 'PLACE_GEOCODE_TIMEOUT', 5),
		)
		response.raise_for_status()
		payload = response.json()
	except (requests.RequestException, ValueError, TypeError):
		return (None, None)

	if not payload:
		return (None, None)

	first_result = payload[0]
	try:
		return (float(first_result['lat']), float(first_result['lon']))
	except (KeyError, TypeError, ValueError):
		return (None, None)


def _build_full_address(place_record):
	parts = [
		place_record.address_line_1,
		place_record.address_line_2,
		_label_for_choice(City, place_record.city),
		place_record.state,
		place_record.postal_code,
	]
	return ', '.join(str(part).strip() for part in parts if str(part).strip())


def _build_geocode_queries(place_record):
	queries = []
	explicit_query = str(getattr(place_record, 'geocode_query', '') or '').strip()
	if explicit_query:
		queries.append(explicit_query)

	full_address = _build_full_address(place_record)
	if full_address and not _looks_like_url(place_record.address_line_1):
		queries.append(full_address)

	city_label = _label_for_choice(City, place_record.city)
	name_query = ', '.join(part for part in [place_record.name, city_label, place_record.state] if part)
	if name_query:
		queries.append(name_query)

	normalized_name = ''.join(character for character in str(place_record.name) if character.isalnum() or character.isspace()).strip()
	if normalized_name and normalized_name != place_record.name:
		queries.append(', '.join(part for part in [normalized_name, city_label, place_record.state] if part))

	return list(dict.fromkeys(query for query in queries if query))


def _looks_like_url(value):
	if not value:
		return False
	parsed = urlparse(str(value).strip())
	return parsed.scheme in {'http', 'https'} and bool(parsed.netloc)


def _build_deal_payload(place_record, deal_record, place_slug):
	deal_key = _build_deal_identity_key(deal_record)
	return {
		'id': _stable_numeric_id(place_record.source_name, place_slug, deal_key, deal_record.deal_type),
		'title': deal_record.title,
		'description': deal_record.description,
		'deal_type': deal_record.deal_type,
		'deal_type_label': _label_for_choice(DealType, deal_record.deal_type),
		'price_text': deal_record.price_text,
		'terms': deal_record.terms,
		'is_active': deal_record.is_active,
		'starts_on': deal_record.starts_on,
		'ends_on': deal_record.ends_on,
		'place_name': place_record.name,
		'happy_hours': [
			{
				'id': _stable_numeric_id(place_record.source_name, place_slug, deal_key, happy_hour.weekday, happy_hour.start_time, happy_hour.end_time, happy_hour.all_day),
				'weekday': happy_hour.weekday,
				'weekday_label': _label_for_choice(Weekday, happy_hour.weekday),
				'start_time': happy_hour.start_time,
				'end_time': happy_hour.end_time,
				'all_day': happy_hour.all_day,
			}
			for happy_hour in deal_record.happy_hours
		],
	}


def _build_deal_identity_key(deal_record):
	if deal_record.external_id:
		return deal_record.external_id

	return '|'.join(
		str(part or '')
		for part in [
			deal_record.title,
			deal_record.description,
			deal_record.price_text,
			deal_record.terms,
			deal_record.source_url,
			deal_record.starts_on,
			deal_record.ends_on,
		]
	)


def _build_place_slug(place_record):
	return slugify(f'{place_record.name}-{place_record.city}')


def _build_profile_key(place_record):
	return '|'.join([
		place_record.source_name,
		_build_profile_slug(place_record),
		_profile_name_for_record(place_record),
	])


def _build_profile_slug(place_record):
	configured_slug = str(getattr(place_record, 'profile_slug', '') or '').strip()
	if configured_slug:
		return configured_slug
	return slugify(_profile_name_for_record(place_record))


def _profile_name_for_record(place_record):
	configured_name = str(getattr(place_record, 'profile_name', '') or '').strip()
	return configured_name or place_record.name


def _label_for_choice(choice_enum, value):
	return choice_enum(value).label


def _stable_numeric_id(*parts):
	raw_value = '|'.join(str(part or '') for part in parts)
	digest = sha256(raw_value.encode('utf-8')).hexdigest()
	return int(digest[:13], 16)