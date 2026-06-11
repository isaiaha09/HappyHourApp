from urllib.parse import urlparse

from places.models import DeletedBusiness
from places.services.importers.discovered_json_places import deserialize_imported_place, serialize_imported_place
from places.services.importers.types import ImportedPlace


def _normalize_lookup_text(value):
	return ''.join(character.lower() for character in str(value or '') if character.isalnum())


def _normalized_domain(value):
	parsed = urlparse(str(value or '').strip())
	return str(parsed.netloc or '').strip().lower().removeprefix('www.')


def imported_place_from_deleted_business(deleted_business):
	payload = deleted_business.payload or {}
	if isinstance(payload, dict) and payload:
		return deserialize_imported_place(payload)

	return ImportedPlace(
		name=deleted_business.name,
		city=deleted_business.city,
		venue_type=deleted_business.venue_type,
		address_line_1=deleted_business.address_line_1,
		address_line_2=deleted_business.address_line_2,
		neighborhood=deleted_business.neighborhood,
		state=deleted_business.state,
		postal_code=deleted_business.postal_code,
		phone_number=deleted_business.phone_number,
		website_url=deleted_business.website_url,
		profile_name=deleted_business.name,
		profile_slug=deleted_business.listing_slug,
		external_id=deleted_business.external_id,
		source_name=deleted_business.source_name,
		source_url=deleted_business.source_url,
	)


def deleted_business_matches_place_record(deleted_business, place_record):
	if str(deleted_business.source_name or '').strip().lower() != str(place_record.source_name or '').strip().lower():
		return False

	deleted_external_id = str(deleted_business.external_id or '').strip().lower()
	place_external_id = str(place_record.external_id or '').strip().lower()
	if deleted_external_id and place_external_id:
		return deleted_external_id == place_external_id

	if str(deleted_business.city or '').strip().lower() != str(place_record.city or '').strip().lower():
		return False

	deleted_address = _normalize_lookup_text(deleted_business.address_line_1)
	place_address = _normalize_lookup_text(place_record.address_line_1)
	if deleted_address and place_address and deleted_address == place_address:
		return True

	deleted_domain = _normalized_domain(deleted_business.website_url)
	place_domain = _normalized_domain(place_record.website_url)
	if deleted_domain and place_domain and deleted_domain == place_domain:
		return True

	return _normalize_lookup_text(deleted_business.name) == _normalize_lookup_text(place_record.name)


def filter_deleted_business_records(place_records):
	deleted_businesses = list(DeletedBusiness.objects.filter(deleted_from_business_database=True))
	if not deleted_businesses:
		return list(place_records)

	filtered_records = []
	for place_record in place_records:
		if any(deleted_business_matches_place_record(deleted_business, place_record) for deleted_business in deleted_businesses):
			continue
		filtered_records.append(place_record)
	return filtered_records


def store_deleted_business(snapshot, removed_records=None):
	removed_records = list(removed_records or [])
	place_record = removed_records[0] if removed_records else ImportedPlace(
		name=snapshot.name,
		city=snapshot.city,
		venue_type=snapshot.venue_type,
		address_line_1=snapshot.address_line_1,
		address_line_2=snapshot.address_line_2,
		neighborhood=snapshot.neighborhood,
		state=snapshot.state,
		postal_code=snapshot.postal_code,
		phone_number=snapshot.phone_number,
		website_url=snapshot.website_url,
		profile_name=snapshot.name,
		profile_slug=snapshot.listing_slug,
		external_id=snapshot.external_id,
		source_name=snapshot.source_name,
		source_url=snapshot.source_url,
	)

	defaults = {
		'deleted_from_business_database': True,
		'name': snapshot.name,
		'city': snapshot.city,
		'venue_type': snapshot.venue_type,
		'address_line_1': snapshot.address_line_1,
		'address_line_2': snapshot.address_line_2,
		'neighborhood': snapshot.neighborhood,
		'state': snapshot.state,
		'postal_code': snapshot.postal_code,
		'phone_number': snapshot.phone_number,
		'website_url': snapshot.website_url,
		'source_name': snapshot.source_name,
		'source_url': snapshot.source_url,
		'social_profiles': snapshot.social_profiles,
		'social_media_links': snapshot.social_media_links,
		'website_url_suppressed': snapshot.website_url_suppressed,
		'external_id': snapshot.external_id,
		'listing_slug': snapshot.listing_slug,
		'payload': serialize_imported_place(place_record),
	}

	lookup = {}
	if snapshot.source_name and snapshot.external_id:
		lookup = {'source_name': snapshot.source_name, 'external_id': snapshot.external_id}
	elif snapshot.listing_slug:
		lookup = {'listing_slug': snapshot.listing_slug}
	else:
		lookup = {'name': snapshot.name, 'city': snapshot.city, 'address_line_1': snapshot.address_line_1}

	deleted_business, _ = DeletedBusiness.objects.update_or_create(**lookup, defaults=defaults)
	return deleted_business