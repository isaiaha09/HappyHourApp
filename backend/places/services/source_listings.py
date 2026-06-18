import re
from hashlib import sha256
from urllib.parse import urlparse

import requests
from django.conf import settings
from django.core.cache import caches
from django.core.exceptions import ImproperlyConfigured
from django.utils.text import slugify

from django.db.models import Q

from places.models import BusinessClaim, BusinessMembership, City, DealType, ListingSnapshot, VenueType, Weekday
from places.services.business_profile_overrides import (
	build_deal_payloads,
	build_deal_weekdays,
	build_operating_hour_payloads,
	build_operating_weekdays,
)
from places.services.importers.business_websites import BusinessWebsiteImporter
from places.services.importers.discovered_json_places import CuratedJsonPlacesImporter, DiscoveryJsonPlacesImporter
from places.services.importers.example_html import ExampleHtmlImporter
from places.services.importers.here_places import HerePlacesImporter
from places.services.importers.openstreetmap_places import HybridPlacesImporter, OpenStreetMapPlacesImporter
from places.services.importers.tomtom_places import TomTomPlacesImporter
from places.services.importers.types import ImportedPlace
from places.services.importers.yelp_places import YelpFusionPlacesImporter
from places.services.social_profiles import build_social_media_links, normalize_social_profiles


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


def load_canonical_source_records(source_name=None):
	canonical_records = []
	for place_records in _group_source_records(load_source_records(source_name=source_name)).values():
		canonical_records.extend(_dedupe_profile_locations(place_records))
	return canonical_records


def _normalize_structured_override_value(value, cleared=False):
	if value is None:
		return None
	if isinstance(value, dict) and not value:
		return None
	if isinstance(value, list) and not value:
		return [] if cleared else None
	return value


def get_source_place_payloads(city=None, venue_type=None, source_name=None, has_deals=None, resolve_missing_coordinates=True):
	payloads_by_slug = {}
	snapshot_overrides_by_slug = _get_listing_snapshot_override_payloads()
	claimed_listing_slugs = _get_claimed_listing_slugs()
	for place_records in _group_source_records(load_source_records(source_name=source_name)).values():
		payload = _build_grouped_place_payload(
			place_records,
			preferred_city=city,
			resolve_missing_coordinates=resolve_missing_coordinates,
		)
		if payload is None:
			continue
		is_claimed = payload['slug'] in claimed_listing_slugs
		if not is_claimed:
			snapshot_slug_override_payload = snapshot_overrides_by_slug['by_slug'].get(payload['slug'])
			if snapshot_slug_override_payload is not None and len(place_records) == 1:
				_apply_claim_structured_overrides(
					payload,
					None,
					payload_namespace=payload['slug'],
					source_payload=snapshot_slug_override_payload,
					apply_source_address_overrides=True,
				)
			elif len(place_records) == 1:
				snapshot_override_payload = _get_matching_listing_snapshot_override_payload_for_record(
					snapshot_overrides_by_slug,
					place_records[0],
				)
				if snapshot_override_payload is not None:
					_apply_claim_structured_overrides(
						payload,
						None,
						payload_namespace=payload['slug'],
						source_payload=snapshot_override_payload,
						apply_source_address_overrides=True,
					)
			else:
				_apply_multi_location_snapshot_overrides(payload, place_records, snapshot_overrides_by_slug)
		payload['is_claimed'] = is_claimed
		payload['is_informal'] = False
		payloads_by_slug[payload['slug']] = payload

	for claim in _get_active_business_claims():
		snapshot_payload = _build_snapshot_place_payload(claim, resolve_missing_coordinates=resolve_missing_coordinates)
		if snapshot_payload is None:
			continue
		snapshot_payload['is_claimed'] = True
		existing_payload = payloads_by_slug.get(snapshot_payload['slug'])
		if existing_payload is None:
			payloads_by_slug[snapshot_payload['slug']] = snapshot_payload
			continue
		payloads_by_slug[snapshot_payload['slug']] = _merge_claimed_snapshot_payload(existing_payload, snapshot_payload)

	for snapshot in _get_unclaimed_manual_admin_snapshots():
		manual_payload = _build_manual_admin_snapshot_payload(snapshot, resolve_missing_coordinates=resolve_missing_coordinates)
		if manual_payload is None:
			continue
		if manual_payload['slug'] not in payloads_by_slug:
			payloads_by_slug[manual_payload['slug']] = manual_payload

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


def _get_listing_snapshot_override_payloads():
	override_payloads = {
		'by_slug': {},
		'by_source_identity': {},
		'by_location_identity': {},
	}
	queryset = (
		ListingSnapshot.objects
		.exclude(listing_slug='')
		.exclude(source_name__in=(BusinessClaim.ADMIN_SOURCE_NAME, *BusinessClaim.USER_SOURCE_NAMES))
		.order_by('-updated_at', '-pk')
	)
	for snapshot in queryset:
		normalized_deal_overrides = _normalize_structured_override_value(snapshot.deal_overrides, cleared=bool(getattr(snapshot, 'deal_overrides_cleared', False)))
		normalized_operating_hour_overrides = _normalize_structured_override_value(snapshot.operating_hour_overrides, cleared=bool(getattr(snapshot, 'operating_hour_overrides_cleared', False)))
		normalized_social_profiles = normalize_social_profiles(
			snapshot.social_profiles,
			fallback_website_url=snapshot.website_url,
			fallback_social_links=snapshot.social_media_links,
		)
		override_payload = {
			'name': snapshot.name,
			'city': snapshot.city,
			'city_label': _label_for_choice(City, snapshot.city) if snapshot.city else '',
			'address_line_1': snapshot.address_line_1,
			'address_line_2': snapshot.address_line_2,
			'neighborhood': snapshot.neighborhood,
			'state': snapshot.state,
			'postal_code': snapshot.postal_code,
			'phone_number': snapshot.phone_number,
			'website_url': snapshot.website_url,
			'imported_image_urls': list(snapshot.imported_image_urls or []),
			'has_image_gallery_override': bool((snapshot.imported_image_urls or []) or (snapshot.suppressed_imported_image_urls or [])),
			'social_profiles': normalized_social_profiles,
			'social_media_links': build_social_media_links(normalized_social_profiles),
			'deal_overrides': normalized_deal_overrides,
			'deal_overrides_cleared': bool(getattr(snapshot, 'deal_overrides_cleared', False)),
			'operating_hour_overrides': normalized_operating_hour_overrides,
			'operating_hour_overrides_cleared': bool(getattr(snapshot, 'operating_hour_overrides_cleared', False)),
		}
		if snapshot.listing_slug and snapshot.listing_slug not in override_payloads['by_slug']:
			override_payloads['by_slug'][snapshot.listing_slug] = override_payload
		source_identity = _build_snapshot_source_identity(snapshot)
		if source_identity and source_identity not in override_payloads['by_source_identity']:
			override_payloads['by_source_identity'][source_identity] = override_payload
		location_identity = _build_snapshot_location_identity(snapshot)
		if location_identity and location_identity not in override_payloads['by_location_identity']:
			override_payloads['by_location_identity'][location_identity] = override_payload
	return override_payloads


def _get_matching_listing_snapshot_override_payload(override_payloads, payload_slug, place_records):
	matched_payload = override_payloads['by_slug'].get(payload_slug)
	if matched_payload is not None:
		return matched_payload

	for place_record in place_records:
		matched_payload = _get_matching_listing_snapshot_override_payload_for_record(override_payloads, place_record)
		if matched_payload is not None:
			return matched_payload

	return None


def _get_matching_listing_snapshot_override_payload_for_record(override_payloads, place_record):
	source_identity = _build_place_record_source_identity(place_record)
	if source_identity:
		matched_payload = override_payloads['by_source_identity'].get(source_identity)
		if matched_payload is not None:
			return matched_payload

	location_identity = _build_place_record_location_identity(place_record)
	if location_identity:
		matched_payload = override_payloads['by_location_identity'].get(location_identity)
		if matched_payload is not None:
			return matched_payload

	return None


def _apply_multi_location_snapshot_overrides(payload, place_records, override_payloads):
	primary_location_id = _resolve_primary_location_id(payload)
	locations_by_id = {location['id']: location for location in payload.get('locations', [])}
	primary_location = None

	for place_record in place_records:
		matched_payload = _get_matching_listing_snapshot_override_payload_for_record(override_payloads, place_record)
		if matched_payload is None:
			continue

		location_id = _stable_numeric_id(place_record.source_name, place_record.external_id, place_record.name, place_record.city)
		location = locations_by_id.get(location_id)
		if location is None:
			continue

		_apply_snapshot_contact_override_to_location(location, matched_payload)
		_apply_snapshot_structured_override_to_location(
			location,
			matched_payload,
			payload_namespace=f"{payload.get('slug', 'location')}:{location_id}",
		)
		if location_id == primary_location_id:
			primary_location = location
			_apply_snapshot_contact_override_to_payload(payload, location)
			_apply_snapshot_structured_override_to_payload(payload, location)

	if primary_location is not None:
		_apply_snapshot_contact_override_to_payload(payload, primary_location)
		_apply_snapshot_structured_override_to_payload(payload, primary_location)

	payload['operating_weekdays'] = sorted({
		weekday
		for location in payload.get('locations', [])
		for weekday in location.get('operating_weekdays', [])
	})
	payload['deal_weekdays'] = sorted({
		weekday
		for location in payload.get('locations', [])
		for weekday in location.get('deal_weekdays', [])
	})
	payload['has_deals'] = any(bool(location.get('has_deals')) for location in payload.get('locations', []))
	payload['deal_count'] = sum(int(location.get('deal_count', 0) or 0) for location in payload.get('locations', []))


def _resolve_primary_location_id(payload):
	for location in payload.get('locations', []):
		if (
			location.get('city') == payload.get('city')
			and location.get('address_line_1') == payload.get('address_line_1')
			and location.get('address_line_2') == payload.get('address_line_2')
			and location.get('postal_code') == payload.get('postal_code')
			and location.get('latitude') == payload.get('latitude')
			and location.get('longitude') == payload.get('longitude')
		):
			return location.get('id')
	return None


def _apply_snapshot_contact_override_to_location(location, override_payload):
	for field_name in ('name', 'city', 'city_label', 'address_line_1', 'address_line_2', 'neighborhood', 'state', 'postal_code', 'phone_number'):
		value = override_payload.get(field_name)
		if value not in (None, ''):
			location[field_name] = value
	if 'website_url' in override_payload:
		location['website_url'] = override_payload.get('website_url', '')
	imported_image_urls = list(override_payload.get('imported_image_urls') or [])
	if override_payload.get('has_image_gallery_override'):
		location['image_urls'] = imported_image_urls
	for field_name in ('social_profiles', 'social_media_links'):
		if field_name in override_payload:
			location[field_name] = override_payload[field_name]


def _apply_snapshot_contact_override_to_payload(payload, location):
	for field_name in ('name', 'city', 'city_label', 'address_line_1', 'address_line_2', 'neighborhood', 'state', 'postal_code', 'phone_number'):
		payload[field_name] = location.get(field_name, payload.get(field_name))
	payload['website_url'] = location.get('website_url', payload.get('website_url', ''))
	payload['image_urls'] = list(location.get('image_urls', payload.get('image_urls', [])) or [])
	for field_name in ('social_profiles', 'social_media_links'):
		payload[field_name] = location.get(field_name, payload.get(field_name, {} if field_name == 'social_profiles' else []))


def _apply_snapshot_structured_override_to_location(location, override_payload, payload_namespace):
	operating_hour_overrides = override_payload.get('operating_hour_overrides')
	if operating_hour_overrides is not None:
		location['operating_hours'] = build_operating_hour_payloads(operating_hour_overrides, payload_namespace)
		location['operating_weekdays'] = build_operating_weekdays(operating_hour_overrides)

	deal_overrides = override_payload.get('deal_overrides')
	if deal_overrides is not None:
		deal_payloads = build_deal_payloads(deal_overrides, payload_namespace)
		location['deals'] = deal_payloads
		location['has_deals'] = bool(deal_payloads)
		location['deal_count'] = len(deal_payloads)
		location['deal_weekdays'] = build_deal_weekdays(deal_overrides)


def _apply_snapshot_structured_override_to_payload(payload, location):
	for field_name in ('operating_hours', 'operating_weekdays', 'deals', 'deal_weekdays', 'has_deals', 'deal_count'):
		if field_name in location:
			payload[field_name] = location[field_name]


def _build_snapshot_source_identity(snapshot):
	source_name = str(snapshot.source_name or '').strip().lower()
	external_id = str(snapshot.external_id or '').strip().lower()
	if not source_name or not external_id:
		return None
	return (source_name, external_id)


def _build_place_record_source_identity(place_record):
	source_name = str(getattr(place_record, 'source_name', '') or '').strip().lower()
	external_id = str(getattr(place_record, 'external_id', '') or '').strip().lower()
	if not source_name or not external_id:
		return None
	return (source_name, external_id)


def _build_snapshot_location_identity(snapshot):
	city = str(snapshot.city or '').strip().lower()
	name = _normalize_location_text(snapshot.name)
	address_line_1 = _normalize_location_text(snapshot.address_line_1)
	if not city or not name:
		return None
	return (city, name, address_line_1)


def _build_place_record_location_identity(place_record):
	city = str(getattr(place_record, 'city', '') or '').strip().lower()
	name = _normalize_location_text(getattr(place_record, 'name', ''))
	address_line_1 = _normalize_location_text(getattr(place_record, 'address_line_1', ''))
	if not city or not name:
		return None
	return (city, name, address_line_1)


def _get_claimed_listing_slugs():
	return set(
		BusinessClaim.objects
		.exclude(status=BusinessClaim.Status.REJECTED)
		.exclude(listing_snapshot__listing_slug='')
		.values_list('listing_snapshot__listing_slug', flat=True)
	)


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
		grouped_records.setdefault(_build_profile_slug(place_record), []).append(place_record)
	return grouped_records


def _build_grouped_place_payload(place_records, preferred_city=None, resolve_missing_coordinates=True):
	if not place_records:
		return None

	canonical_place_records = _dedupe_profile_locations(place_records)
	primary_place_record = max(canonical_place_records, key=_place_record_quality_score)
	grouped_deals = _build_grouped_deal_payloads(canonical_place_records)
	location_payloads = [
		_build_location_payload(place_record, resolve_missing_coordinates=resolve_missing_coordinates)
		for place_record in canonical_place_records
	]
	location_payloads.sort(key=lambda location: (location['city_label'], location['address_line_1'], location['id']))
	primary_location = _select_primary_location(location_payloads, preferred_city)
	profile_name = _profile_name_for_record(primary_place_record)
	profile_slug = _build_profile_slug(primary_place_record)

	return {
		'id': _stable_numeric_id(primary_place_record.source_name, profile_slug, profile_name),
		'name': profile_name,
		'slug': profile_slug,
		'is_claimed': False,
		'social_profiles': {},
		'direct_messaging_enabled': False,
		'direct_message_restricted': False,
		'can_direct_message': False,
		'social_media_links': [],
		'offer_entries': [],
		'hours_of_operation_entries': [],
		'photo_references': [],
		'supporting_details': '',
		'city': primary_location['city'],
		'city_label': primary_location['city_label'],
		'venue_type': primary_place_record.venue_type,
		'venue_type_label': _label_for_choice(VenueType, primary_place_record.venue_type),
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


def _get_unclaimed_manual_admin_snapshots():
	claimed_snapshot_ids = set(
		BusinessClaim.objects
		.exclude(status=BusinessClaim.Status.REJECTED)
		.values_list('listing_snapshot_id', flat=True)
	)
	return (
		ListingSnapshot.objects
		.filter(source_name=BusinessClaim.ADMIN_SOURCE_NAME)
		.exclude(listing_slug='')
		.exclude(pk__in=claimed_snapshot_ids)
		.order_by('name', 'city', 'pk')
	)


def _build_manual_admin_snapshot_payload(snapshot, resolve_missing_coordinates=True):
	is_live_location_business = snapshot.venue_type == VenueType.MOBILE or snapshot.serves_multiple_areas
	should_resolve_coordinates = resolve_missing_coordinates and not is_live_location_business
	normalized_social_profiles = normalize_social_profiles(
		snapshot.social_profiles,
		fallback_website_url=snapshot.website_url,
		fallback_social_links=snapshot.social_media_links,
	)
	place_record = ImportedPlace(
		name=snapshot.name,
		profile_name=snapshot.name,
		profile_slug=snapshot.listing_slug,
		city=snapshot.city,
		venue_type=snapshot.venue_type,
		address_line_1=snapshot.address_line_1,
		address_line_2=snapshot.address_line_2,
		neighborhood=snapshot.neighborhood,
		state=snapshot.state,
		postal_code=snapshot.postal_code,
		latitude=snapshot.tracked_location_latitude if is_live_location_business else None,
		longitude=snapshot.tracked_location_longitude if is_live_location_business else None,
		phone_number=snapshot.phone_number,
		website_url=snapshot.website_url,
		external_id=snapshot.external_id or snapshot.listing_slug or f'listing-snapshot-{snapshot.pk}',
		source_name=BusinessClaim.ADMIN_SOURCE_NAME,
		source_url=snapshot.source_url,
	)
	payload = _build_place_payload(place_record, resolve_missing_coordinates=should_resolve_coordinates)
	if payload is None:
		return None
	payload['is_claimed'] = False
	payload['is_informal'] = False
	payload['social_profiles'] = normalized_social_profiles
	payload['social_media_links'] = build_social_media_links(normalized_social_profiles)
	normalized_deal_overrides = _normalize_structured_override_value(
		snapshot.deal_overrides, cleared=bool(getattr(snapshot, 'deal_overrides_cleared', False))
	)
	normalized_operating_hour_overrides = _normalize_structured_override_value(
		snapshot.operating_hour_overrides, cleared=bool(getattr(snapshot, 'operating_hour_overrides_cleared', False))
	)
	override_payload = {
		'deal_overrides': normalized_deal_overrides,
		'deal_overrides_cleared': bool(getattr(snapshot, 'deal_overrides_cleared', False)),
		'operating_hour_overrides': normalized_operating_hour_overrides,
		'operating_hour_overrides_cleared': bool(getattr(snapshot, 'operating_hour_overrides_cleared', False)),
		'website_url': snapshot.website_url,
		'phone_number': snapshot.phone_number,
	}
	_apply_claim_structured_overrides(
		payload,
		None,
		payload_namespace=snapshot.listing_slug or f'manual-{snapshot.pk}',
		source_payload=override_payload,
		apply_source_address_overrides=False,
	)
	return payload


def _get_active_business_claims():
	memberships = (
		BusinessMembership.objects
		.select_related('claim__listing_snapshot')
		.filter(is_active=True)
		.order_by('-approved_at', '-created_at')
	)
	seen_snapshot_ids = set()
	for membership in memberships:
		claim = membership.claim
		snapshot = claim.listing_snapshot
		if snapshot.pk in seen_snapshot_ids:
			continue
		seen_snapshot_ids.add(snapshot.pk)
		yield claim

	approved_claims_without_active_membership = (
		BusinessClaim.objects
		.select_related('listing_snapshot')
		.filter(status=BusinessClaim.Status.APPROVED)
		.exclude(membership__is_active=True)
		.order_by('-reviewed_at', '-submitted_at', '-created_at')
	)
	for claim in approved_claims_without_active_membership:
		snapshot = claim.listing_snapshot
		if snapshot.pk in seen_snapshot_ids:
			continue
		seen_snapshot_ids.add(snapshot.pk)
		yield claim



def _claim_photo_urls(claim):
	return [reference for reference in list(claim.photo_references or []) if str(reference or '').strip().lower().startswith(('http://', 'https://'))]


def _build_claim_override_payload(claim, public_address_overridden=False, public_postal_code_overridden=False):
	normalized_social_profiles = normalize_social_profiles(
		claim.social_profiles,
		fallback_website_url=claim.business_website_url,
		fallback_social_links=claim.social_media_links,
	)
	return {
		'is_informal': claim.pathway == BusinessClaim.Pathway.INFORMAL,
		'direct_messaging_enabled': bool(claim.direct_messaging_enabled),
		'direct_message_restricted': False,
		'can_direct_message': False,
		'public_address_overridden': public_address_overridden,
		'public_postal_code_overridden': public_postal_code_overridden,
		'social_profiles': normalized_social_profiles,
		'social_media_links': build_social_media_links(normalized_social_profiles),
		'deal_overrides': claim.deal_overrides,
		'operating_hour_overrides': claim.operating_hour_overrides,
		'offer_entries': list(claim.offer_entries or []),
		'hours_of_operation_entries': list(claim.hours_of_operation_entries or []),
		'photo_references': list(claim.photo_references or []),
		'photo_gallery_overridden': bool(claim.photo_gallery_overridden),
		'supporting_details': str(claim.supporting_details or '').strip(),
	}


def _build_snapshot_place_payload(claim, resolve_missing_coordinates=True):
	snapshot = claim.listing_snapshot
	is_live_location_business = snapshot.venue_type == VenueType.MOBILE or snapshot.serves_multiple_areas
	should_resolve_coordinates = resolve_missing_coordinates and not is_live_location_business
	public_address_fields, public_address_overridden, public_postal_code_overridden = _resolve_claim_public_address_fields(claim, snapshot, is_live_location_business)
	website_url = claim.business_website_url or snapshot.website_url
	public_phone_number = str(claim.work_phone or '').strip() or snapshot.phone_number
	place_record = ImportedPlace(
		name=snapshot.name,
		profile_name=snapshot.name,
		profile_slug=snapshot.listing_slug,
		city=snapshot.city,
		venue_type=snapshot.venue_type,
		address_line_1=public_address_fields['address_line_1'],
		address_line_2=public_address_fields['address_line_2'],
		neighborhood=public_address_fields['neighborhood'],
		state=snapshot.state,
		postal_code=public_address_fields['postal_code'],
		latitude=snapshot.tracked_location_latitude if is_live_location_business else None,
		longitude=snapshot.tracked_location_longitude if is_live_location_business else None,
		phone_number=public_phone_number,
		website_url=website_url,
		external_id=snapshot.external_id or snapshot.listing_slug or f'listing-snapshot-{snapshot.pk}',
		source_name='claimed_business',
		source_url=snapshot.source_url,
	)
	payload = _build_place_payload(place_record, resolve_missing_coordinates=should_resolve_coordinates)
	if payload is not None:
		payload.update(_build_claim_override_payload(
			claim,
			public_address_overridden=public_address_overridden,
			public_postal_code_overridden=public_postal_code_overridden,
		))
		_apply_claim_structured_overrides(payload, claim, payload_namespace=snapshot.listing_slug or f'claim-{claim.pk}')
		photo_urls = _claim_photo_urls(claim)
		if photo_urls:
			payload['image_urls'] = list(dict.fromkeys([*payload.get('image_urls', []), *photo_urls]))
			for location in payload.get('locations', []):
				location['image_urls'] = list(dict.fromkeys([*location.get('image_urls', []), *photo_urls]))
		payload['is_claimed'] = True
	return payload


def _snapshot_display_address(snapshot):
	if snapshot.venue_type == VenueType.MOBILE or snapshot.serves_multiple_areas:
		if snapshot.tracked_location_latitude is not None and snapshot.tracked_location_longitude is not None:
			return 'Approximate live location'
		return snapshot.address_line_1 or 'Approximate live location unavailable'
	return snapshot.address_line_1


def _resolve_claim_public_address_fields(claim, snapshot, is_live_location_business):
	if is_live_location_business:
		return {
			'address_line_1': _snapshot_display_address(snapshot),
			'address_line_2': snapshot.address_line_2,
			'neighborhood': snapshot.neighborhood,
			'postal_code': snapshot.postal_code,
		}, False, False

	public_address = str(claim.employer_address or '').strip()
	if not public_address:
		return {
			'address_line_1': snapshot.address_line_1,
			'address_line_2': snapshot.address_line_2,
			'neighborhood': snapshot.neighborhood,
			'postal_code': snapshot.postal_code,
		}, False, False

	parsed_address = _parse_public_claim_address(public_address)
	return {
		'address_line_1': parsed_address.get('address_line_1') or public_address,
		'address_line_2': '',
		'neighborhood': '',
		'postal_code': parsed_address.get('postal_code') or '',
	}, True, bool(parsed_address.get('postal_code'))


def _parse_public_claim_address(address_value):
	parts = [part.strip() for part in str(address_value or '').split(',') if part.strip()]
	if len(parts) < 3:
		return {
			'address_line_1': str(address_value or '').strip(),
			'postal_code': '',
		}

	state_zip_match = re.fullmatch(r'(?P<state>[A-Za-z]{2})(?:\s+(?P<postal_code>\d{5}(?:-\d{4})?))?', parts[-1])
	if state_zip_match is None:
		return {
			'address_line_1': str(address_value or '').strip(),
			'postal_code': '',
		}

	street_parts = parts[:-2]
	address_line_1 = ', '.join(street_parts).strip() if street_parts else str(address_value or '').strip()
	return {
		'address_line_1': address_line_1 or str(address_value or '').strip(),
		'postal_code': state_zip_match.group('postal_code') or '',
	}


def _merge_claimed_snapshot_payload(existing_payload, snapshot_payload):
	merged_payload = dict(existing_payload)
	is_live_location_business = snapshot_payload.get('venue_type') == VenueType.MOBILE
	owner_controls_public_address = bool(snapshot_payload.get('public_address_overridden'))
	owner_controls_public_postal_code = bool(snapshot_payload.get('public_postal_code_overridden'))
	owner_website_url = snapshot_payload.get('website_url') or existing_payload.get('website_url', '')
	owner_phone_number = snapshot_payload.get('phone_number') or existing_payload.get('phone_number', '')
	owner_controls_photo_gallery = bool(snapshot_payload.get('photo_gallery_overridden'))
	owner_image_urls = list(dict.fromkeys(
		snapshot_payload.get('image_urls', []) if owner_controls_photo_gallery
		else [*existing_payload.get('image_urls', []), *snapshot_payload.get('image_urls', [])]
	))
	merged_locations = []
	location_source = snapshot_payload.get('locations', []) if is_live_location_business else existing_payload.get('locations', [])
	for location in location_source:
		merged_location = dict(location)
		if owner_controls_public_address:
			merged_location['address_line_1'] = snapshot_payload['address_line_1']
			merged_location['address_line_2'] = snapshot_payload['address_line_2']
			merged_location['neighborhood'] = snapshot_payload['neighborhood']
			merged_location['postal_code'] = snapshot_payload['postal_code'] if owner_controls_public_postal_code else existing_payload['postal_code']
		if owner_website_url:
			merged_location['website_url'] = owner_website_url
		if owner_phone_number:
			merged_location['phone_number'] = owner_phone_number
		if owner_image_urls:
			merged_location['image_urls'] = owner_image_urls
		merged_locations.append(merged_location)

	merged_payload.update({
		'city': snapshot_payload['city'],
		'city_label': snapshot_payload['city_label'],
		'is_claimed': True,
		'is_informal': bool(snapshot_payload.get('is_informal')),
		'venue_type': snapshot_payload['venue_type'],
		'venue_type_label': snapshot_payload['venue_type_label'],
		'address_line_1': snapshot_payload['address_line_1'] if is_live_location_business or owner_controls_public_address else existing_payload['address_line_1'],
		'address_line_2': snapshot_payload['address_line_2'] if is_live_location_business or owner_controls_public_address else existing_payload['address_line_2'],
		'neighborhood': snapshot_payload['neighborhood'] if is_live_location_business or owner_controls_public_address else existing_payload['neighborhood'],
		'state': snapshot_payload['state'] if is_live_location_business else existing_payload['state'],
		'postal_code': snapshot_payload['postal_code'] if is_live_location_business or owner_controls_public_postal_code else existing_payload['postal_code'],
		'latitude': snapshot_payload['latitude'] if is_live_location_business else existing_payload['latitude'],
		'longitude': snapshot_payload['longitude'] if is_live_location_business else existing_payload['longitude'],
		'phone_number': owner_phone_number,
		'website_url': owner_website_url,
		'image_urls': owner_image_urls,
		'is_verified': True,
		'locations': merged_locations or existing_payload.get('locations', []),
		'social_profiles': snapshot_payload.get('social_profiles', {}),
		'deal_overrides': snapshot_payload.get('deal_overrides'),
		'operating_hour_overrides': snapshot_payload.get('operating_hour_overrides'),
		'social_media_links': snapshot_payload.get('social_media_links', []),
		'offer_entries': snapshot_payload.get('offer_entries', []),
		'hours_of_operation_entries': snapshot_payload.get('hours_of_operation_entries', []),
		'photo_references': snapshot_payload.get('photo_references', []),
		'supporting_details': snapshot_payload.get('supporting_details', ''),
		'direct_messaging_enabled': bool(snapshot_payload.get('direct_messaging_enabled', False)),
		'direct_message_restricted': bool(snapshot_payload.get('direct_message_restricted', False)),
		'can_direct_message': bool(snapshot_payload.get('can_direct_message', False)),
	})
	_apply_claim_structured_overrides(merged_payload, None, payload_namespace=snapshot_payload.get('slug', existing_payload.get('slug', 'claimed-business')), source_payload=snapshot_payload)
	return merged_payload


def _apply_claim_structured_overrides(payload, claim=None, payload_namespace='', source_payload=None, apply_source_address_overrides=False):
	resolved_source_payload = source_payload or {}
	name_override = resolved_source_payload.get('name') if source_payload is not None else ''
	address_override_fields = {
		'city': resolved_source_payload.get('city'),
		'city_label': resolved_source_payload.get('city_label'),
		'address_line_1': resolved_source_payload.get('address_line_1'),
		'address_line_2': resolved_source_payload.get('address_line_2'),
		'neighborhood': resolved_source_payload.get('neighborhood'),
		'state': resolved_source_payload.get('state'),
		'postal_code': resolved_source_payload.get('postal_code'),
	} if source_payload is not None and apply_source_address_overrides else {}
	phone_number = resolved_source_payload.get('phone_number') if source_payload is not None else ''
	website_url = resolved_source_payload.get('website_url') if source_payload is not None else ''
	social_profiles = resolved_source_payload.get('social_profiles') if source_payload is not None else None
	social_media_links = resolved_source_payload.get('social_media_links') if source_payload is not None else None
	deal_overrides = resolved_source_payload.get('deal_overrides') if source_payload is not None else getattr(claim, 'deal_overrides', None)
	operating_hour_overrides = resolved_source_payload.get('operating_hour_overrides') if source_payload is not None else getattr(claim, 'operating_hour_overrides', None)
	deal_overrides = _normalize_structured_override_value(deal_overrides, cleared=bool(resolved_source_payload.get('deal_overrides_cleared')) if source_payload is not None else False)
	operating_hour_overrides = _normalize_structured_override_value(operating_hour_overrides, cleared=bool(resolved_source_payload.get('operating_hour_overrides_cleared')) if source_payload is not None else False)

	if name_override:
		payload['name'] = name_override
		for location in payload.get('locations', []):
			location['name'] = name_override

	for field_name, value in address_override_fields.items():
		if value not in (None, ''):
			payload[field_name] = value
			for location in payload.get('locations', []):
				location[field_name] = value

	if source_payload is not None and 'website_url' in resolved_source_payload:
		payload['website_url'] = website_url or ''
		for location in payload.get('locations', []):
			location['website_url'] = website_url or ''
	elif website_url:
		payload['website_url'] = website_url
		for location in payload.get('locations', []):
			location['website_url'] = website_url

	imported_image_urls = list(resolved_source_payload.get('imported_image_urls') or []) if source_payload is not None else []
	if source_payload is not None and resolved_source_payload.get('has_image_gallery_override'):
		payload['image_urls'] = imported_image_urls
		for location in payload.get('locations', []):
			location['image_urls'] = imported_image_urls

	if phone_number:
		payload['phone_number'] = phone_number
		for location in payload.get('locations', []):
			location['phone_number'] = phone_number

	if social_profiles is not None:
		payload['social_profiles'] = social_profiles
		for location in payload.get('locations', []):
			location['social_profiles'] = social_profiles

	if social_media_links is not None:
		payload['social_media_links'] = social_media_links
		for location in payload.get('locations', []):
			location['social_media_links'] = social_media_links

	if operating_hour_overrides is not None:
		operating_hours = build_operating_hour_payloads(operating_hour_overrides, payload_namespace)
		payload['operating_hours'] = operating_hours
		payload['hours_of_operation_entries'] = []
		payload['operating_weekdays'] = build_operating_weekdays(operating_hour_overrides)
		for location in payload.get('locations', []):
			location['operating_hours'] = operating_hours
			location['operating_weekdays'] = payload['operating_weekdays']

	if deal_overrides is not None:
		deal_payloads = build_deal_payloads(deal_overrides, payload_namespace)
		deal_weekdays = build_deal_weekdays(deal_overrides)
		payload['deals'] = deal_payloads
		payload['offer_entries'] = []
		payload['has_deals'] = bool(deal_payloads)
		payload['deal_count'] = len(deal_payloads)
		payload['deal_weekdays'] = deal_weekdays
		for location in payload.get('locations', []):
			location['deals'] = deal_payloads
			location['has_deals'] = bool(deal_payloads)
			location['deal_count'] = len(deal_payloads)
			location['deal_weekdays'] = deal_weekdays


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
	if value in (None, ''):
		return ''
	return choice_enum(value).label


def _stable_numeric_id(*parts):
	raw_value = '|'.join(str(part or '') for part in parts)
	digest = sha256(raw_value.encode('utf-8')).hexdigest()
	return int(digest[:13], 16)