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
		'has_happy_hours': _location_has_happy_hour(location),
	}


def _location_has_happy_hour(location):
	for deal in location.get('deals') or []:
		if deal.get('is_active', True) and any(
			bool(happy_hour.get('all_day')) or bool(str(happy_hour.get('start_time') or '').strip())
			for happy_hour in deal.get('happy_hours') or []
		):
			return True
	return False


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
			if only_with_deals and not _location_has_happy_hour(location):
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


def _resolve_happy_hour_business_row(row):
	try:
		listing_slug, location = resolve_business_location(row.get('slug'), row.get('location_id'))
	except ValueError:
		return None
	if not _location_has_happy_hour(location):
		return None
	return listing_slug, location


@transaction.atomic
def save_customer_preferences(user, data):
	profile = AccountProfile.objects.select_for_update().get(user=user)
	action = data.get('action', 'save')
	if action == 'skip':
		profile.preference_onboarding_completed = False
		profile.preference_onboarding_skipped = True
		profile.direct_message_notifications_enabled = False
		profile.business_updates_notifications_enabled = False
		profile.happy_hour_notifications_enabled = False
		profile.save(update_fields=['preference_onboarding_completed', 'preference_onboarding_skipped', 'direct_message_notifications_enabled', 'business_updates_notifications_enabled', 'happy_hour_notifications_enabled', 'updated_at'])
		return profile

	direct_message_notifications_enabled = bool(data.get('direct_message_notifications_enabled', False))
	business_updates_notifications_enabled = bool(data.get('business_updates_notifications_enabled', False))
	happy_hour_notifications_enabled = bool(data.get('happy_hour_notifications_enabled', False))

	business_rows = data.get('businesses')
	if business_rows is not None:
		FavoriteBusiness.objects.filter(user=user).update(happy_hour_notifications_enabled=False)
		for row in business_rows:
			resolved_business = _resolve_happy_hour_business_row(row)
			if resolved_business is None:
				continue
			listing_slug, location = resolved_business
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
			favorite.profile_updates_enabled = business_updates_notifications_enabled
			favorite.happy_hour_notifications_enabled = happy_hour_notifications_enabled
			favorite.deal_updates_enabled = business_updates_notifications_enabled
			favorite.direct_message_notifications_enabled = direct_message_notifications_enabled
			favorite.save()

	FavoriteBusiness.objects.filter(user=user).update(
		profile_updates_enabled=business_updates_notifications_enabled,
		deal_updates_enabled=business_updates_notifications_enabled,
		direct_message_notifications_enabled=direct_message_notifications_enabled,
	)

	for field_name in ('preferred_cities', 'preferred_days', 'preferred_time_periods', 'notifications_paused'):
		if field_name in data:
			setattr(profile, field_name, data[field_name])
	profile.direct_message_notifications_enabled = direct_message_notifications_enabled
	profile.business_updates_notifications_enabled = business_updates_notifications_enabled
	profile.happy_hour_notifications_enabled = happy_hour_notifications_enabled

	profile.preference_onboarding_completed = action == 'complete' or profile.preference_onboarding_completed
	profile.preference_onboarding_skipped = False
	profile.save(update_fields=[
		'preference_onboarding_completed',
		'preference_onboarding_skipped',
		'preferred_cities',
		'preferred_days',
		'preferred_time_periods',
		'notifications_paused',
		'direct_message_notifications_enabled',
		'business_updates_notifications_enabled',
		'happy_hour_notifications_enabled',
		'updated_at',
	])
	return profile
