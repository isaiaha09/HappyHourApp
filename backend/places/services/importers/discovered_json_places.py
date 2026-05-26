import json
from pathlib import Path

from django.conf import settings

from places.services.discovery_exclusions import get_source_excluded_businesses, get_source_excluded_external_ids
from places.services.importers.business_websites import BusinessWebsiteImporter
from places.services.importers.types import ImportedDeal, ImportedHappyHour, ImportedOperatingHour, ImportedPlace


def get_discovery_json_path():
	configured_path = getattr(settings, 'DISCOVERY_JSON_PATH', '')
	if configured_path:
		return Path(configured_path)
	return Path(settings.BASE_DIR) / 'config' / 'discovered_places.json'


def _normalize_lookup_text(value):
	return ''.join(character.lower() for character in str(value or '').strip() if character.isalnum())


def filter_configured_place_records(place_records):
	filtered_records = []
	for place_record in place_records:
		source_name = str(getattr(place_record, 'source_name', '') or '').strip().lower()
		external_id = str(getattr(place_record, 'external_id', '') or '').strip().lower()
		city = _normalize_lookup_text(getattr(place_record, 'city', ''))
		name = _normalize_lookup_text(getattr(place_record, 'name', ''))

		excluded_external_ids = get_source_excluded_external_ids(source_name)
		if external_id and external_id in excluded_external_ids:
			continue

		excluded_businesses = get_source_excluded_businesses(source_name)
		if city and name and (city, name) in excluded_businesses:
			continue

		filtered_records.append(place_record)

	return filtered_records


def serialize_imported_place(place_record):
	return {
		'name': place_record.name,
		'city': place_record.city,
		'venue_type': place_record.venue_type,
		'address_line_1': place_record.address_line_1,
		'address_line_2': place_record.address_line_2,
		'neighborhood': place_record.neighborhood,
		'state': place_record.state,
		'postal_code': place_record.postal_code,
		'latitude': place_record.latitude,
		'longitude': place_record.longitude,
		'geocode_query': place_record.geocode_query,
		'phone_number': place_record.phone_number,
		'website_url': place_record.website_url,
		'image_urls': list(place_record.image_urls),
		'profile_name': place_record.profile_name,
		'profile_slug': place_record.profile_slug,
		'is_active': place_record.is_active,
		'external_id': place_record.external_id,
		'source_name': place_record.source_name,
		'source_url': place_record.source_url,
		'deals': [
			{
				'title': deal.title,
				'deal_type': deal.deal_type,
				'description': deal.description,
				'price_text': deal.price_text,
				'terms': deal.terms,
				'is_active': deal.is_active,
				'starts_on': deal.starts_on,
				'ends_on': deal.ends_on,
				'external_id': deal.external_id,
				'source_name': deal.source_name,
				'source_url': deal.source_url,
				'happy_hours': [
					{
						'weekday': happy_hour.weekday,
						'start_time': happy_hour.start_time,
						'end_time': happy_hour.end_time,
						'all_day': happy_hour.all_day,
					}
					for happy_hour in deal.happy_hours
				],
			}
			for deal in place_record.deals
		],
		'operating_hours': [
			{
				'weekday': operating_hour.weekday,
				'open_time': operating_hour.open_time,
				'close_time': operating_hour.close_time,
			}
			for operating_hour in place_record.operating_hours
		],
	}


def deserialize_imported_place(payload):
	return ImportedPlace(
		name=str(payload.get('name') or '').strip(),
		city=str(payload.get('city') or '').strip(),
		venue_type=str(payload.get('venue_type') or '').strip(),
		address_line_1=str(payload.get('address_line_1') or '').strip(),
		address_line_2=str(payload.get('address_line_2') or '').strip(),
		neighborhood=str(payload.get('neighborhood') or '').strip(),
		state=str(payload.get('state') or 'CA').strip() or 'CA',
		postal_code=str(payload.get('postal_code') or '').strip(),
		latitude=payload.get('latitude'),
		longitude=payload.get('longitude'),
		geocode_query=str(payload.get('geocode_query') or '').strip(),
		phone_number=str(payload.get('phone_number') or '').strip(),
		website_url=str(payload.get('website_url') or '').strip(),
		image_urls=[str(value).strip() for value in payload.get('image_urls', []) if str(value).strip()],
		profile_name=str(payload.get('profile_name') or '').strip(),
		profile_slug=str(payload.get('profile_slug') or '').strip(),
		is_active=bool(payload.get('is_active', True)),
		external_id=str(payload.get('external_id') or '').strip(),
		source_name=str(payload.get('source_name') or '').strip(),
		source_url=str(payload.get('source_url') or '').strip(),
		deals=[
			ImportedDeal(
				title=str(deal_payload.get('title') or '').strip(),
				deal_type=str(deal_payload.get('deal_type') or '').strip(),
				description=str(deal_payload.get('description') or '').strip(),
				price_text=str(deal_payload.get('price_text') or '').strip(),
				terms=str(deal_payload.get('terms') or '').strip(),
				is_active=bool(deal_payload.get('is_active', True)),
				starts_on=deal_payload.get('starts_on'),
				ends_on=deal_payload.get('ends_on'),
				external_id=str(deal_payload.get('external_id') or '').strip(),
				source_name=str(deal_payload.get('source_name') or '').strip(),
				source_url=str(deal_payload.get('source_url') or '').strip(),
				happy_hours=[
					ImportedHappyHour(
						weekday=happy_hour_payload['weekday'],
						start_time=str(happy_hour_payload.get('start_time') or '').strip(),
						end_time=str(happy_hour_payload.get('end_time') or '').strip(),
						all_day=bool(happy_hour_payload.get('all_day', False)),
					)
					for happy_hour_payload in deal_payload.get('happy_hours', [])
					if 'weekday' in happy_hour_payload
				],
			)
			for deal_payload in payload.get('deals', [])
			if str(deal_payload.get('title') or '').strip() and str(deal_payload.get('deal_type') or '').strip()
		],
		operating_hours=[
			ImportedOperatingHour(
				weekday=operating_hour_payload['weekday'],
				open_time=str(operating_hour_payload.get('open_time') or '').strip(),
				close_time=str(operating_hour_payload.get('close_time') or '').strip(),
			)
			for operating_hour_payload in payload.get('operating_hours', [])
			if 'weekday' in operating_hour_payload
		],
	)


def load_discovery_json_records(file_path=None):
	path = Path(file_path) if file_path else get_discovery_json_path()
	if not path.exists():
		return []

	content = path.read_text(encoding='utf-8').strip()
	if not content:
		return []

	payload = json.loads(content)
	if not isinstance(payload, list):
		return []
	loaded_records = [deserialize_imported_place(place_payload) for place_payload in payload if isinstance(place_payload, dict)]
	return filter_configured_place_records(loaded_records)


def write_discovery_json_records(place_records, file_path=None):
	path = Path(file_path) if file_path else get_discovery_json_path()
	path.parent.mkdir(parents=True, exist_ok=True)
	serialized_payload = [serialize_imported_place(place_record) for place_record in filter_configured_place_records(place_records)]
	serialized_payload.sort(key=lambda item: (str(item.get('city') or ''), str(item.get('name') or ''), str(item.get('address_line_1') or '')))
	path.write_text(json.dumps(serialized_payload, indent=2), encoding='utf-8')
	return path


def merge_discovery_json_records(place_records, file_path=None):
	existing_records = load_discovery_json_records(file_path=file_path)
	merged_records = []
	seen_keys = set()

	for place_record in list(place_records) + existing_records:
		identity_key = _record_identity_key(place_record)
		if identity_key in seen_keys:
			continue
		seen_keys.add(identity_key)
		merged_records.append(place_record)

	return write_discovery_json_records(merged_records, file_path=file_path)


def filter_duplicate_records(candidate_records, existing_records):
	existing_name_keys = {_normalize_name_key(record) for record in existing_records if _normalize_name_key(record)}
	existing_address_keys = {_normalize_address_key(record) for record in existing_records if _normalize_address_key(record)}
	filtered_records = []

	for record in candidate_records:
		name_key = _normalize_name_key(record)
		address_key = _normalize_address_key(record)
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


class DiscoveryJsonPlacesImporter:
	source_name = 'discovery_json_places'

	def load_records(self, html=None):
		if html is not None:
			raise ValueError('DiscoveryJsonPlacesImporter loads stored discovery data and does not accept HTML input.')
		return load_discovery_json_records()


class CuratedJsonPlacesImporter:
	source_name = 'curated_json_places'

	def __init__(self, session=None, website_importer=None, discovery_importer=None):
		self.website_importer = website_importer or BusinessWebsiteImporter(session=session)
		self.discovery_importer = discovery_importer or DiscoveryJsonPlacesImporter()

	def load_records(self, html=None):
		if html is not None:
			raise ValueError('CuratedJsonPlacesImporter composes curated websites and stored JSON discovery data and does not accept HTML input.')

		website_records = list(self.website_importer.load_records())
		discovery_records = list(self.discovery_importer.load_records())
		return website_records + discovery_records


def _normalize_name_key(record):
	name = ''.join(character.lower() for character in str(record.name) if character.isalnum())
	city = str(record.city or '').strip().lower()
	if not name or not city:
		return ''
	return f'{city}:{name}'


def _normalize_address_key(record):
	address = ''.join(character.lower() for character in str(record.address_line_1 or '') if character.isalnum())
	city = str(record.city or '').strip().lower()
	if not address or not city:
		return ''
	return f'{city}:{address}'


def _record_identity_key(record):
	source_name = str(getattr(record, 'source_name', '') or '').strip().lower()
	external_id = str(getattr(record, 'external_id', '') or '').strip().lower()
	if source_name and external_id:
		return f'{source_name}:{external_id}'

	name_key = _normalize_name_key(record)
	address_key = _normalize_address_key(record)
	if name_key and address_key:
		return f'{name_key}:{address_key}'
	return name_key or address_key or f'unknown:{id(record)}'
