from django.db import transaction

from places.models import AccountProfile, City, FavoriteBusiness
from places.services.source_listings import get_source_place_payload, get_source_place_payloads


TIME_PERIODS = ('morning', 'afternoon', 'evening')
PREFERENCE_CITIES = tuple(City.values)


def _as_int(value, default=0):
	try:
		return int(value)
	except (TypeError, ValueError):
		return default


def _get_location_payload(payload, location_id=None):
	locations = list(payload.get('locations') or [])
	if not locations:
		locations = [payload]
	if location_id is None:
		return locations[0]
	return next((location for location in locations if _as_int(location.get('id')) == _as_int(location_id)), None)


def _build_business_summary(listing_slug, location):
	return {
		'slug': listing_slug,
		'location_id': location.get('id'),
		'name': location.get('name', ''),
		'city': location.get('city', ''),
		'city_label': location.get('city_label', ''),
		'venue_type': location.get('venue_type', ''),
		'venue_type_label': location.get('venue_type_label', ''),
		'address_line_1': location.get('address_line_1', ''),
		'website_url': location.get('website_url', ''),
		'deal_count': _as_int(location.get('deal_count')),
		'has_deals': bool(location.get('has_deals')),
	}


def get_preference_business_options(cities=None, only_with_deals=True):
	selected_cities = set(cities or PREFERENCE_CITIES)
	options = []
	seen = set()
	for payload in get_source_place_payloads(resolve_missing_coordinates=False):
		listing_slug = str(payload.get('slug') or '').strip()
		if not listing_slug:
			continue
		for location in payload.get('locations') or [payload]:
			city = str(location.get('city') or '').strip().lower()
			location_id = location.get('id')
			identity = (listing_slug, _as_int(location_id))
			if city not in selected_cities or identity in seen:
				continue
			if only_with_deals and _as_int(location.get('deal_count')) <= 0 and not location.get('has_deals'):
				continue
			seen.add(identity)
			options.append(_build_business_summary(listing_slug, location))
	return sorted(options, key=lambda option: (
		option.get('city_label', ''),
		option.get('name', ''),
		option.get('address_line_1', ''),
	))


def resolve_business_location(listing_slug, location_id=None, payload=None):
	listing_slug = str(listing_slug or '').strip()
	payload = payload if payload is not None else get_source_place_payload(listing_slug)
	if payload is None:
		raise ValueError('One of the selected businesses could not be found.')
	location = _get_location_payload(payload, location_id)
	if location is None:
		raise ValueError('One of the selected business locations could not be found.')
	return listing_slug, location


def _resolve_business_row(row):
	return resolve_business_location(row.get('slug'), row.get('location_id'))


@transaction.atomic
def save_customer_preferences(user, data):
	profile = AccountProfile.objects.select_for_update().get(user=user)
	action = data.get('action', 'save')
	if action == 'skip':
		profile.preference_onboarding_completed = False
		profile.preference_onboarding_skipped = True
		profile.save(update_fields=['preference_onboarding_completed', 'preference_onboarding_skipped', 'updated_at'])
		return profile

	business_rows = data.get('businesses')
	retained_favorite_ids = set()
	if business_rows is not None:
		for row in business_rows:
			listing_slug, location = _resolve_business_row(row)
			location_id = location.get('id')
			favorite = FavoriteBusiness.objects.filter(
				user=user,
				listing_slug=listing_slug,
				location_id=location_id,
			).first()
			if favorite is None:
				favorite = FavoriteBusiness.objects.filter(
					user=user,
					listing_slug=listing_slug,
					location_id__isnull=True,
				).first()
			if favorite is None:
				favorite = FavoriteBusiness(user=user, listing_slug=listing_slug, location_id=location_id)
			else:
				favorite.location_id = location_id
			favorite.name = location.get('name', '')
			favorite.city = location.get('city', '')
			favorite.city_label = location.get('city_label', '')
			favorite.venue_type = location.get('venue_type', '')
			favorite.venue_type_label = location.get('venue_type_label', '')
			favorite.address_line_1 = location.get('address_line_1', '')
			favorite.website_url = location.get('website_url', '')
			favorite.profile_updates_enabled = bool(row.get('profile_updates_enabled', False))
			favorite.happy_hour_notifications_enabled = bool(row.get('happy_hour_notifications_enabled', False))
			favorite.deal_updates_enabled = bool(row.get('deal_updates_enabled', False))
			favorite.direct_message_notifications_enabled = bool(row.get('direct_message_notifications_enabled', False))
			favorite.save()
			retained_favorite_ids.add(favorite.pk)
		FavoriteBusiness.objects.filter(user=user).exclude(pk__in=retained_favorite_ids).delete()

	for field_name in ('preferred_cities', 'preferred_days', 'preferred_time_periods', 'notifications_paused'):
		if field_name in data:
			setattr(profile, field_name, data[field_name])

	profile.preference_onboarding_completed = action == 'complete' or profile.preference_onboarding_completed
	profile.preference_onboarding_skipped = False
	profile.save(update_fields=[
		'preference_onboarding_completed',
		'preference_onboarding_skipped',
		'preferred_cities',
		'preferred_days',
		'preferred_time_periods',
		'notifications_paused',
		'updated_at',
	])
	return profile
