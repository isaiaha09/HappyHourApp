from datetime import datetime, time
import logging
from zoneinfo import ZoneInfo

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from places.models import AccountProfile, FavoriteBusiness, FavoriteBusinessNotification, HappyHourNotificationDelivery
from places.services.favorite_push import send_push_notifications_for_favorite_business_event
from places.services.source_listings import get_source_place_payloads


logger = logging.getLogger(__name__)
BUSINESS_TIME_ZONE = ZoneInfo('America/Los_Angeles')
TIME_PERIOD_BOUNDS = {
	'morning': (time(5, 0), time(12, 0)),
	'afternoon': (time(12, 0), time(17, 0)),
	'evening': (time(17, 0), time(23, 59, 59)),
}


def _parse_time(value):
	normalized = str(value or '').strip().upper()
	for pattern in ('%H:%M', '%I:%M %p', '%I %p'):
		try:
			return datetime.strptime(normalized, pattern).time()
		except ValueError:
			continue
	return None


def _parse_date(value):
	normalized = str(value or '').strip()
	if not normalized:
		return None
	try:
		return datetime.fromisoformat(normalized.replace('Z', '+00:00')).date()
	except ValueError:
		try:
			return datetime.strptime(normalized[:10], '%Y-%m-%d').date()
		except ValueError:
			return None


def _time_period(start_time):
	for period, (lower_bound, upper_bound) in TIME_PERIOD_BOUNDS.items():
		if lower_bound <= start_time <= upper_bound:
			return period
	return None


def _active_on_date(deal, local_date):
	starts_on = _parse_date(deal.get('starts_on'))
	ends_on = _parse_date(deal.get('ends_on'))
	return not (starts_on and local_date < starts_on) and not (ends_on and local_date > ends_on)


def _operating_hours_start_time(location, weekday):
	for operating_hour in location.get('operating_hours') or []:
		try:
			operating_weekday = int(operating_hour.get('weekday', -1))
		except (TypeError, ValueError):
			continue
		if operating_weekday != weekday:
			continue
		if operating_hour.get('open_24_hours'):
			return time(0, 0)
		start_time = _parse_time(operating_hour.get('open_time'))
		if start_time is not None:
			return start_time
	return None


def _happy_hour_start_time(happy_hour, location, weekday):
	if happy_hour.get('all_day'):
		return _operating_hours_start_time(location, weekday) or _parse_time(happy_hour.get('start_time')) or time(0, 0)
	return _parse_time(happy_hour.get('start_time'))


def _due_occurrences(now_local, window_minutes):
	occurrences = []
	window_seconds = max(int(window_minutes), 1) * 60
	for payload in get_source_place_payloads(resolve_missing_coordinates=False):
		listing_slug = str(payload.get('slug') or '').strip()
		if not listing_slug:
			continue
		for location in payload.get('locations') or [payload]:
			location_id = location.get('id')
			for deal in location.get('deals') or []:
				if not deal.get('is_active') or not _active_on_date(deal, now_local.date()):
					continue
				for happy_hour in deal.get('happy_hours') or []:
					weekday = int(happy_hour.get('weekday', -1))
					if weekday != now_local.weekday():
						continue
					start_time = _happy_hour_start_time(happy_hour, location, weekday)
					if start_time is None:
						continue
					started_at = datetime.combine(now_local.date(), start_time, tzinfo=BUSINESS_TIME_ZONE)
					age_seconds = (now_local - started_at).total_seconds()
					if age_seconds < 0 or age_seconds > window_seconds:
						continue
					occurrence_key = ':'.join([
						listing_slug,
						str(location_id or ''),
						str(deal.get('id') or deal.get('title') or 'deal'),
						str(happy_hour.get('id') or start_time.isoformat()),
						started_at.isoformat(),
					])
					occurrences.append({
						'occurrence_key': occurrence_key,
						'listing_slug': listing_slug,
						'location_id': location_id,
						'business_name': location.get('name') or payload.get('name') or 'Business',
						'deal_title': str(deal.get('title') or 'Happy Hour').strip(),
						'started_at': started_at,
						'weekday': weekday,
						'period': _time_period(start_time),
					})
	return occurrences


def _favorite_matches_location(favorite, occurrence):
	return favorite.listing_slug == occurrence['listing_slug'] and (
		favorite.location_id is None
		or favorite.location_id == occurrence['location_id']
	)


def _eligible_favorites_with_counts(occurrence):
	favorites = list(FavoriteBusiness.objects.select_related('user__account_profile').filter(
		listing_slug=occurrence['listing_slug'],
	))
	counts = {
		'favorite_candidates': len(favorites),
		'location_matches': 0,
		'favorite_notifications_enabled': 0,
		'account_notifications_enabled': 0,
		'notifications_not_paused': 0,
		'preferred_day_matches': 0,
		'preferred_time_matches': 0,
	}
	eligible = []
	for favorite in favorites:
		if not _favorite_matches_location(favorite, occurrence):
			continue
		counts['location_matches'] += 1
		if not favorite.happy_hour_notifications_enabled:
			continue
		counts['favorite_notifications_enabled'] += 1
		profile = getattr(favorite.user, 'account_profile', None)
		if profile is None or not profile.happy_hour_notifications_enabled:
			continue
		counts['account_notifications_enabled'] += 1
		if profile.notifications_paused:
			continue
		counts['notifications_not_paused'] += 1
		if occurrence['weekday'] not in list(profile.preferred_days or []):
			continue
		counts['preferred_day_matches'] += 1
		if occurrence['period'] not in list(profile.preferred_time_periods or []):
			continue
		counts['preferred_time_matches'] += 1
		eligible.append(favorite)
	return eligible, counts


def _eligible_favorites(occurrence):
	eligible, _ = _eligible_favorites_with_counts(occurrence)
	return eligible


def _normalize_push_delivery_count(value):
	try:
		return max(int(value), 0)
	except (TypeError, ValueError):
		return 0


def _create_delivery(favorite, occurrence):
	title = f"Happy Hour is happening at {occurrence['business_name']} now!"
	message = occurrence['deal_title']
	try:
		with transaction.atomic():
			_, created = HappyHourNotificationDelivery.objects.get_or_create(
				user=favorite.user,
				occurrence_key=occurrence['occurrence_key'],
				defaults={
					'listing_slug': occurrence['listing_slug'],
					'location_id': occurrence['location_id'],
					'business_name': occurrence['business_name'],
					'title': title,
					'message': message,
					'started_at': occurrence['started_at'],
				},
			)
			if not created:
				return False, 0
			FavoriteBusinessNotification.objects.create(
				user=favorite.user,
				listing_slug=occurrence['listing_slug'],
				business_name=occurrence['business_name'],
				event_type=FavoriteBusinessNotification.EventType.HAPPY_HOUR,
				title=title,
				message=message,
			)
	except IntegrityError:
		return False

	push_delivery_count = _normalize_push_delivery_count(send_push_notifications_for_favorite_business_event(
		[favorite.user_id],
		listing_slug=occurrence['listing_slug'],
		title=title,
		message=message,
		event_type=FavoriteBusinessNotification.EventType.HAPPY_HOUR,
	))
	if push_delivery_count == 0:
		logger.warning(
			'Happy-hour notification created without Expo delivery for user_id=%s listing_slug=%s location_id=%s.',
			favorite.user_id,
			occurrence['listing_slug'],
			occurrence['location_id'],
		)
	return True, push_delivery_count


def process_due_happy_hour_notifications(reference_time=None):
	now_utc = reference_time or timezone.now()
	now_local = now_utc.astimezone(BUSINESS_TIME_ZONE)
	window_minutes = getattr(settings, 'HAPPY_HOUR_NOTIFICATION_WINDOW_MINUTES', 10)
	sent_count = 0
	occurrence_count = 0
	eligible_favorite_count = 0
	push_delivery_count = 0
	eligibility_counts = {
		'favorite_candidates': 0,
		'location_matches': 0,
		'favorite_notifications_enabled': 0,
		'account_notifications_enabled': 0,
		'notifications_not_paused': 0,
		'preferred_day_matches': 0,
		'preferred_time_matches': 0,
	}
	for occurrence in _due_occurrences(now_local, window_minutes):
		occurrence_count += 1
		eligible_favorites, occurrence_counts = _eligible_favorites_with_counts(occurrence)
		eligible_favorite_count += len(eligible_favorites)
		for key, value in occurrence_counts.items():
			eligibility_counts[key] += value
		for favorite in eligible_favorites:
			created, delivered = _create_delivery(favorite, occurrence)
			if created:
				sent_count += 1
				push_delivery_count += delivered
	return {
		'occurrences_checked': occurrence_count,
		'eligible_favorites': eligible_favorite_count,
		'notifications_sent': sent_count,
		'push_notifications_delivered': push_delivery_count,
		'window_minutes': int(window_minutes),
		**eligibility_counts,
	}
