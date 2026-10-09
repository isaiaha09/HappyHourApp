from urllib.parse import urlparse

from django.db.models import Q
from django.utils.text import slugify

from places.models import BusinessClaim, BusinessDirectMessageThread, DeletedBusiness, ListingSnapshot
from places.services.account_profiles import remove_favorites_for_listing_slugs
from places.services.importers.discovered_json_places import deserialize_imported_place, serialize_imported_place
from places.services.importers.discovered_json_places import load_discovery_json_records, write_discovery_json_records
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


def _deleted_business_listing_slugs(deleted_business):
	return {
		str(listing_slug or '').strip()
		for listing_slug in (
			deleted_business.listing_slug,
			slugify(f'{deleted_business.name}-{deleted_business.city}'),
		)
		if str(listing_slug or '').strip()
	}


def _matching_snapshot_queryset(deleted_business):
	identity_query = Q()
	source_name = str(deleted_business.source_name or '').strip()
	external_id = str(deleted_business.external_id or '').strip()
	listing_slug = str(deleted_business.listing_slug or '').strip()
	if source_name and external_id:
		identity_query = Q(source_name__iexact=source_name, external_id__iexact=external_id)
	elif listing_slug:
		identity_query = Q(listing_slug=listing_slug)
	if not identity_query:
		return ListingSnapshot.objects.none()
	return ListingSnapshot.objects.filter(identity_query).order_by('pk')


def preserve_direct_message_threads_for_claim(claim):
	"""Keep conversation history readable after the associated business claim is removed."""
	if claim is None or not claim.pk:
		return 0
	return BusinessDirectMessageThread.objects.filter(business_claim_id=claim.pk).update(
		business_name_snapshot=claim.listing_snapshot.name,
		business_slug_snapshot=claim.listing_snapshot.listing_slug,
		business_owner_user_id_snapshot=str(claim.claimant_id),
		business_claim=None,
	)


def purge_business_claim_media(claim):
	"""Remove claim uploads from storage before deleting their database references."""
	from places.services.media_storage import delete_storage_references

	references = list(claim.photo_references or [])
	for deal in claim.deal_overrides or []:
		if isinstance(deal, dict) and isinstance(deal.get('attachment'), dict):
			attachment = deal['attachment']
			references.extend([attachment.get('url'), attachment.get('media_id')])
	references.extend(claim.managed_media.values_list('storage_name', flat=True))
	delete_storage_references(references, claim=claim)
	for attachment in list(claim.attachments.all()):
		if attachment.file:
			attachment.file.delete(save=False)
	claim.attachments.all().delete()
	claim.managed_media.all().delete()
	claim.profile_entries.all().delete()


def permanently_delete_listing_snapshot(snapshot, *, remove_favorites=True, remove_discovery=True, remove_archive=True):
	"""Purge a business snapshot and its claim data without losing old DM history."""
	if snapshot is None:
		return {'removed_discovery_records': 0, 'removed_favorites': 0, 'removed_claims': 0}

	claims = list(snapshot.business_claims.select_related('claimant', 'listing_snapshot').all())
	for claim in claims:
		preserve_direct_message_threads_for_claim(claim)
		purge_business_claim_media(claim)
	for claim in claims:
		claim.delete()

	removed_records = []
	if remove_discovery and str(snapshot.source_name or '').strip().lower() in {'business_websites', 'verified_businesses'}:
		deleted_identity = DeletedBusiness(
			source_name=snapshot.source_name,
			external_id=snapshot.external_id,
			listing_slug=snapshot.listing_slug,
			name=snapshot.name,
			city=snapshot.city,
			address_line_1=snapshot.address_line_1,
			website_url=snapshot.website_url,
		)
		existing_records = load_discovery_json_records()
		kept_records = []
		for place_record in existing_records:
			if deleted_business_matches_place_record(deleted_identity, place_record):
				removed_records.append(place_record)
			else:
				kept_records.append(place_record)
		if removed_records:
			write_discovery_json_records(kept_records)

	listing_slugs = _deleted_business_listing_slugs(DeletedBusiness(
		listing_slug=snapshot.listing_slug,
		name=snapshot.name,
		city=snapshot.city,
	))
	removed_favorites = remove_favorites_for_listing_slugs(listing_slugs) if remove_favorites else 0
	if remove_archive:
		if snapshot.source_name and snapshot.external_id:
			DeletedBusiness.objects.filter(
				source_name__iexact=snapshot.source_name,
				external_id__iexact=snapshot.external_id,
			).delete()
		elif snapshot.listing_slug:
			DeletedBusiness.objects.filter(listing_slug=snapshot.listing_slug).delete()
		else:
			DeletedBusiness.objects.filter(
				name=snapshot.name,
				city=snapshot.city,
				address_line_1=snapshot.address_line_1,
			).delete()
	if snapshot.pk:
		snapshot.delete()
	return {
		'removed_discovery_records': len(removed_records),
		'removed_favorites': removed_favorites,
		'removed_claims': len(claims),
	}


def purge_business_claim_records(claims, *, remove_created_snapshots=True):
	"""Delete selected claim records, optionally purging orphaned self-service businesses."""
	claims = [claim for claim in claims if claim is not None and claim.pk]
	if not claims:
		return {'removed_claims': 0, 'removed_snapshots': 0}
	claim_ids = {claim.pk for claim in claims}
	created_snapshots = {}
	for claim in claims:
		snapshot = claim.listing_snapshot
		if (
			remove_created_snapshots
			and claim.pathway in {BusinessClaim.Pathway.ESTABLISHED, BusinessClaim.Pathway.INFORMAL}
			and snapshot.source_name in BusinessClaim.USER_SOURCE_NAMES
		):
			created_snapshots[snapshot.pk] = snapshot
		preserve_direct_message_threads_for_claim(claim)
		purge_business_claim_media(claim)
	for claim in claims:
		claim.delete()

	removed_snapshots = 0
	for snapshot in created_snapshots.values():
		if BusinessClaim.objects.filter(listing_snapshot_id=snapshot.pk).exclude(pk__in=claim_ids).exists():
			continue
		permanently_delete_listing_snapshot(snapshot)
		removed_snapshots += 1
	return {'removed_claims': len(claims), 'removed_snapshots': removed_snapshots}


def purge_deleted_business_data(deleted_business):
	"""Permanently remove catalog/source data for a deleted business.

	The DeletedBusiness row is intentionally not deleted here. The admin caller
	removes that final restore record only after this cleanup succeeds, so a
	failed purge cannot silently remove the restore option.
	"""
	listing_slugs = _deleted_business_listing_slugs(deleted_business)

	existing_records = load_discovery_json_records()
	kept_records = []
	removed_records = []
	for place_record in existing_records:
		if deleted_business_matches_place_record(deleted_business, place_record):
			removed_records.append(place_record)
		else:
			kept_records.append(place_record)

	removed_favorites = remove_favorites_for_listing_slugs(listing_slugs)
	matching_snapshots = list(_matching_snapshot_queryset(deleted_business))
	for snapshot in matching_snapshots:
		permanently_delete_listing_snapshot(
			snapshot,
			remove_favorites=False,
			remove_discovery=False,
			remove_archive=False,
		)
	if removed_records:
		write_discovery_json_records(kept_records)

	return {
		'removed_discovery_records': len(removed_records),
		'removed_favorites': removed_favorites,
		'removed_snapshots': len(matching_snapshots),
	}
