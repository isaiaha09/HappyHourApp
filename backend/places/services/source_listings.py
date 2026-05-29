from hashlib import sha256
from urllib.parse import urlparse

import requests
from django.conf import settings
from django.core.cache import caches
from django.core.exceptions import ImproperlyConfigured
from django.utils.text import slugify

from places.models import BusinessMembership, City, DealType, VenueType, Weekday
from places.services.importers.business_websites import BusinessWebsiteImporter
from places.services.importers.discovered_json_places import CuratedJsonPlacesImporter, DiscoveryJsonPlacesImporter
from places.services.importers.example_html import ExampleHtmlImporter
from places.services.importers.here_places import HerePlacesImporter
from places.services.importers.openstreetmap_places import HybridPlacesImporter, OpenStreetMapPlacesImporter
from places.services.importers.tomtom_places import TomTomPlacesImporter
from places.services.importers.types import ImportedPlace
from places.services.importers.yelp_places import YelpFusionPlacesImporter


RUNTIME_IMPORTER_REGISTRY = {
	'business_websites': BusinessWebsiteImporter,
	'curated_json_places': CuratedJsonPlacesImporter,
	'discovery_json_places': DiscoveryJsonPlacesImporter,
	'here_places': HerePlacesImporter,
	'hybrid_places': HybridPlacesImporter,
	'openstreetmap_places': OpenStreetMapPlacesImporter,
	'tomtom_places': TomTomPlacesImporter,
	'yelp_fusion_places': YelpFusionPlacesImporter,
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


def get_source_place_payloads(city=None, venue_type=None, source_name=None, has_deals=None, resolve_missing_coordinates=True):
	payloads_by_slug = {}
	for place_records in _group_source_records(load_source_records(source_name=source_name)).values():
		payload = _build_grouped_place_payload(
			place_records,
			preferred_city=city,
			resolve_missing_coordinates=resolve_missing_coordinates,
		)
		if payload is None:
			continue
		payloads_by_slug[payload['slug']] = payload

	for snapshot in _get_active_business_snapshots():
		snapshot_payload = _build_snapshot_place_payload(snapshot, resolve_missing_coordinates=resolve_missing_coordinates)
		if snapshot_payload is None:
			continue
		existing_payload = payloads_by_slug.get(snapshot_payload['slug'])
		if existing_payload is None:
			payloads_by_slug[snapshot_payload['slug']] = snapshot_payload
			continue
		if snapshot.venue_type == VenueType.MOBILE or snapshot.serves_multiple_areas:
			payloads_by_slug[snapshot_payload['slug']] = _merge_mobile_snapshot_payload(existing_payload, snapshot_payload)

	payloads = []
	for payload in payloads_by_slug.values():
		if has_deals is True and not payload['has_deals']:
			continue
		if has_deals is False and payload['has_deals']:
			continue
		if city and city not in {location['city'] for location in payload['locations']}:
			continue
		if venue_type and payload['venue_type'] != venue_type:
			continue
		payloads.append(payload)

	return sorted(payloads, key=lambda payload: (payload['name'], payload['city_label']))


def get_source_place_payload(slug, source_name=None):
	for payload in get_source_place_payloads(source_name=source_name, resolve_missing_coordinates=True):
		if payload['slug'] == slug:
			return payload
		for location in payload.get('locations', []):
			if location.get('slug') == slug:
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


def _build_place_payload(place_record, resolve_missing_coordinates=True):
	return _build_grouped_place_payload([place_record], resolve_missing_coordinates=resolve_missing_coordinates)


def _group_source_records(place_records):
	grouped_records = {}
	for place_record in place_records:
		if not place_record.is_active:
			continue
		grouped_records.setdefault(_build_profile_key(place_record), []).append(place_record)
	return grouped_records


def _build_grouped_place_payload(place_records, preferred_city=None, resolve_missing_coordinates=True):
	if not place_records:
		return None

	canonical_place_records = _dedupe_profile_locations(place_records)
	grouped_deals = _build_grouped_deal_payloads(canonical_place_records)
	location_payloads = [
		_build_location_payload(place_record, resolve_missing_coordinates=resolve_missing_coordinates)
		for place_record in canonical_place_records
	]
	location_payloads.sort(key=lambda location: (location['city_label'], location['address_line_1'], location['id']))
	primary_location = _select_primary_location(location_payloads, preferred_city)
	profile_name = _profile_name_for_record(canonical_place_records[0])
	profile_slug = _build_profile_slug(canonical_place_records[0])

	return {
		'id': _stable_numeric_id(canonical_place_records[0].source_name, profile_slug, profile_name),
		'name': profile_name,
		'slug': profile_slug,
		'city': primary_location['city'],
		'city_label': primary_location['city_label'],
		'venue_type': canonical_place_records[0].venue_type,
		'venue_type_label': _label_for_choice(VenueType, canonical_place_records[0].venue_type),
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
		'is_active': any(place_record.is_active for place_record in canonical_place_records),
		'has_deals': bool(grouped_deals),
		'deal_count': len(grouped_deals),
		'operating_weekdays': sorted({
			weekday
			for location in location_payloads
			for weekday in location.get('operating_weekdays', [])
		}),
		'deal_weekdays': sorted({
			weekday
			for location in location_payloads
			for weekday in location.get('deal_weekdays', [])
		}),
		'is_verified': any(bool(location.get('is_verified')) for location in location_payloads),
		'deals': grouped_deals,
		'locations': location_payloads,
	}


def _get_active_business_snapshots():
	memberships = (
		BusinessMembership.objects
		.select_related('claim__listing_snapshot')
		.filter(is_active=True)
		.order_by('-approved_at', '-created_at')
	)
	seen_snapshot_ids = set()
	for membership in memberships:
		snapshot = membership.claim.listing_snapshot
		if snapshot.pk in seen_snapshot_ids:
			continue
		seen_snapshot_ids.add(snapshot.pk)
		yield snapshot


def _build_snapshot_place_payload(snapshot, resolve_missing_coordinates=True):
	is_live_location_business = snapshot.venue_type == VenueType.MOBILE or snapshot.serves_multiple_areas
	should_resolve_coordinates = resolve_missing_coordinates and not is_live_location_business
	place_record = ImportedPlace(
		name=snapshot.name,
		profile_name=snapshot.name,
		profile_slug=snapshot.listing_slug,
		city=snapshot.city,
		venue_type=snapshot.venue_type,
		address_line_1=_snapshot_display_address(snapshot),
		address_line_2=snapshot.address_line_2,
		neighborhood=snapshot.neighborhood,
		state=snapshot.state,
		postal_code=snapshot.postal_code,
		latitude=snapshot.tracked_location_latitude if is_live_location_business else None,
		longitude=snapshot.tracked_location_longitude if is_live_location_business else None,
		phone_number=snapshot.phone_number,
		website_url=snapshot.website_url,
		external_id=snapshot.external_id or snapshot.listing_slug or f'listing-snapshot-{snapshot.pk}',
		source_name='claimed_business',
		source_url=snapshot.source_url or snapshot.website_url,
	)
	return _build_place_payload(place_record, resolve_missing_coordinates=should_resolve_coordinates)


def _snapshot_display_address(snapshot):
	if snapshot.venue_type == VenueType.MOBILE or snapshot.serves_multiple_areas:
		if snapshot.tracked_location_latitude is not None and snapshot.tracked_location_longitude is not None:
			return 'Approximate live location'
		return snapshot.address_line_1 or 'Approximate live location unavailable'
	return snapshot.address_line_1


def _merge_mobile_snapshot_payload(existing_payload, snapshot_payload):
	merged_payload = dict(existing_payload)
	merged_payload.update({
		'city': snapshot_payload['city'],
		'city_label': snapshot_payload['city_label'],
		'venue_type': snapshot_payload['venue_type'],
		'venue_type_label': snapshot_payload['venue_type_label'],
		'address_line_1': snapshot_payload['address_line_1'],
		'address_line_2': snapshot_payload['address_line_2'],
		'neighborhood': snapshot_payload['neighborhood'],
		'state': snapshot_payload['state'],
		'postal_code': snapshot_payload['postal_code'],
		'latitude': snapshot_payload['latitude'],
		'longitude': snapshot_payload['longitude'],
		'phone_number': snapshot_payload['phone_number'] or existing_payload['phone_number'],
		'website_url': snapshot_payload['website_url'] or existing_payload['website_url'],
		'is_verified': True,
		'locations': snapshot_payload['locations'],
	})
	return merged_payload


def _dedupe_profile_locations(place_records):
	ordered_records = []
	for place_record in place_records:
		existing_index = _find_matching_profile_location_index(ordered_records, place_record)
		existing_record = ordered_records[existing_index] if existing_index is not None else None
		if existing_record is None:
			ordered_records.append(place_record)
			continue
		if _place_record_quality_score(place_record) > _place_record_quality_score(existing_record):
			ordered_records[existing_index] = place_record
	return ordered_records


def _find_matching_profile_location_index(existing_records, candidate_record):
	candidate_city = str(candidate_record.city or '').strip().lower()
	candidate_address = _normalize_location_text(candidate_record.address_line_1)
	candidate_address_core = _normalize_address_core(candidate_record.address_line_1)
	candidate_has_street_number = _address_has_street_number(candidate_record.address_line_1)
	candidate_profile_name = _normalize_location_text(_profile_name_for_record(candidate_record))
	for index, existing_record in enumerate(existing_records):
		existing_city = str(existing_record.city or '').strip().lower()
		if existing_city != candidate_city:
			continue
		existing_address = _normalize_location_text(existing_record.address_line_1)
		existing_address_core = _normalize_address_core(existing_record.address_line_1)
		existing_has_street_number = _address_has_street_number(existing_record.address_line_1)
		existing_profile_name = _normalize_location_text(_profile_name_for_record(existing_record))
		if candidate_address and existing_address:
			if candidate_address == existing_address:
				return index
			if candidate_profile_name == existing_profile_name and (
				candidate_address in existing_address or existing_address in candidate_address
			):
				return index
			if candidate_profile_name == existing_profile_name and candidate_address_core and candidate_address_core == existing_address_core:
				if candidate_has_street_number != existing_has_street_number:
					return index
		elif candidate_profile_name and candidate_profile_name == existing_profile_name:
			return index
	return None


def _normalize_location_text(value):
	return ''.join(character.lower() for character in str(value or '') if character.isalnum())


def _normalize_address_core(value):
	tokens = _tokenize_address(value)
	while tokens and (tokens[0].isdigit() or len(tokens[0]) == 1):
		tokens = tokens[1:]
	return ' '.join(tokens)


def _address_has_street_number(value):
	tokens = _tokenize_address(value)
	return bool(tokens and tokens[0].isdigit())


def _tokenize_address(value):
	replacements = {
		'street': 'st',
		'avenue': 'ave',
		'boulevard': 'blvd',
		'drive': 'dr',
		'road': 'rd',
		'lane': 'ln',
		'court': 'ct',
		'place': 'pl',
		'terrace': 'ter',
		'highway': 'hwy',
	}
	cleaned = ''.join(character.lower() if character.isalnum() or character.isspace() else ' ' for character in str(value or ''))
	tokens = [token for token in cleaned.split() if token]
	return [replacements.get(token, token) for token in tokens]


def _place_record_quality_score(place_record):
	source_preference = {
		'business_websites': 40,
		'here_places': 20,
		'tomtom_places': 15,
		'openstreetmap_places': 10,
	}
	return (
		source_preference.get(str(place_record.source_name or ''), 0)
		+ len(getattr(place_record, 'deals', [])) * 10
		+ len(getattr(place_record, 'operating_hours', [])) * 4
		+ len(getattr(place_record, 'image_urls', [])) * 2
		+ (1 if getattr(place_record, 'phone_number', '') else 0)
		+ (1 if getattr(place_record, 'website_url', '') else 0)
	)



def _build_location_payload(place_record, resolve_missing_coordinates=True):
	place_slug = _build_place_slug(place_record)
	latitude, longitude = _get_place_coordinates(place_record, resolve_missing=resolve_missing_coordinates)
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
		'has_deals': any(deal_record.is_active for deal_record in place_record.deals),
		'deal_count': sum(1 for deal_record in place_record.deals if deal_record.is_active),
		'operating_weekdays': _build_operating_weekdays(place_record),
		'deal_weekdays': _build_deal_weekdays(place_record),
		'is_verified': _is_verified_place_record(place_record),
		'deals': [
			_build_deal_payload(place_record, deal_record, place_slug)
			for deal_record in place_record.deals
			if deal_record.is_active
		],
	}


def _build_grouped_deal_payloads(place_records):
	deal_payloads = []
	seen_keys = set()
	for place_record in place_records:
		place_slug = _build_place_slug(place_record)
		for deal_record in place_record.deals:
			if not deal_record.is_active:
				continue
			deal_identity_key = _build_deal_identity_key(deal_record)
			composite_key = (place_slug, deal_identity_key, deal_record.deal_type)
			if composite_key in seen_keys:
				continue
			seen_keys.add(composite_key)
			deal_payloads.append(_build_deal_payload(place_record, deal_record, place_slug))
	return sorted(deal_payloads, key=lambda payload: (payload['place_name'], payload['title']))


def _select_primary_location(location_payloads, preferred_city=None):
	if preferred_city:
		for location in location_payloads:
			if location['city'] == preferred_city:
				return location
	return location_payloads[0]


def _get_place_coordinates(place_record, resolve_missing=True):
	try:
		imported_latitude = getattr(place_record, 'latitude', None)
		imported_longitude = getattr(place_record, 'longitude', None)
		if imported_latitude is not None and imported_longitude is not None:
			return (float(imported_latitude), float(imported_longitude))
	except (TypeError, ValueError):
		pass

	if not resolve_missing:
		return (None, None)

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


def _build_operating_weekdays(place_record):
	return sorted({
		operating_hour.weekday
		for operating_hour in getattr(place_record, 'operating_hours', [])
	})


def _build_deal_weekdays(place_record):
	return sorted({
		happy_hour.weekday
		for deal_record in getattr(place_record, 'deals', [])
		if deal_record.is_active
		for happy_hour in deal_record.happy_hours
	})


def _is_verified_place_record(place_record):
	return getattr(place_record, 'source_name', '') in {'business_websites', 'claimed_business'}


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