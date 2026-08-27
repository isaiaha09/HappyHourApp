from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from django.utils import timezone

from places.services.source_listings import get_source_place_payloads


BUSINESS_TIME_ZONE = ZoneInfo('America/Los_Angeles')


def get_current_happy_hours_payload(*, reference: datetime | None = None, city: str | None = None) -> dict[str, object]:
	"""Return the active happy-hour windows for the business's local time."""
	now_local = _localize_reference(reference)
	normalized_city = str(city or '').strip().lower()
	payloads = get_source_place_payloads(
		city=None if normalized_city in {'', 'all'} else normalized_city,
		resolve_missing_coordinates=True,
	)

	places_by_key: dict[tuple[str, int], dict[str, object]] = {}
	for payload in payloads:
		for location in payload.get('locations') or [payload]:
			location_city = str(location.get('city') or '').strip().lower()
			if normalized_city not in {'', 'all'} and location_city != normalized_city:
				continue

			active_windows = _get_active_windows(location, now_local)
			if not active_windows:
				continue

			place_row = _build_place_row(payload, location, active_windows)
			if place_row is None:
				continue
			place_key = (str(place_row['slug']), int(place_row['location_id']))
			existing_row = places_by_key.get(place_key)
			if existing_row is None:
				places_by_key[place_key] = place_row
				continue

			_existing_windows = existing_row['happy_hours']
			if not isinstance(_existing_windows, list):
				_existing_windows = []
			seen_windows = {_window_identity(window) for window in _existing_windows}
			for window in active_windows:
				if _window_identity(window) not in seen_windows:
					_existing_windows.append(window)
					seen_windows.add(_window_identity(window))
			existing_row['happy_hours'] = _existing_windows

	places = sorted(
		places_by_key.values(),
		key=lambda row: (
			str(row['name']).lower(),
			str(row['city_label']).lower(),
			int(row['location_id']),
		),
	)
	return {'observed_at': now_local.isoformat(), 'places': places}


def _localize_reference(reference: datetime | None) -> datetime:
	candidate = reference or timezone.now()
	if timezone.is_naive(candidate):
		candidate = timezone.make_aware(candidate, BUSINESS_TIME_ZONE)
	return timezone.localtime(candidate, BUSINESS_TIME_ZONE)


def _get_active_windows(location: dict[str, Any], now_local: datetime) -> list[dict[str, object]]:
	if not _location_is_open(location, now_local):
		return []

	active: list[dict[str, object]] = []
	for deal in location.get('deals') or []:
		if not _is_truthy(deal.get('is_active')):
			continue

		for window in deal.get('happy_hours') or []:
			schedule_date = _active_window_schedule_date(window, now_local)
			if schedule_date is None or not _deal_active_on_date(deal, schedule_date):
				continue

			active.append({
				'deal_id': _coerce_integer(deal.get('id')),
				'title': str(deal.get('title') or 'Happy Hour').strip() or 'Happy Hour',
				'price_text': str(deal.get('price_text') or '').strip(),
				'weekday_label': str(window.get('weekday_label') or '').strip(),
				'start_time': str(window.get('start_time') or '').strip(),
				'end_time': str(window.get('end_time') or '').strip(),
				'all_day': _is_truthy(window.get('all_day')),
			})
	return active


def _location_is_open(location: dict[str, Any], now_local: datetime) -> bool:
	"""Return whether a location is open now in the business time zone.

	Some imported listings do not include operating hours. In that case the
	availability is unknown, so preserve the previous behavior and let the
	deal schedule decide. When usable hours are present, a deal is only current
	while at least one operating-hours window is active.
	"""
	raw_operating_hours = location.get('operating_hours')
	if not isinstance(raw_operating_hours, list) or not raw_operating_hours:
		return True

	return any(
		isinstance(operating_window, dict)
		and _operating_window_is_active(operating_window, now_local)
		for operating_window in raw_operating_hours
	)


def _operating_window_is_active(window: dict[str, Any], now_local: datetime) -> bool:
	weekday = _parse_weekday(window.get('weekday'))
	if weekday is None:
		return False

	if _is_truthy(window.get('open_24_hours')):
		return weekday == now_local.weekday()

	bounds = (
		_parse_time(window.get('open_time')),
		_parse_time(window.get('close_time')),
	)
	if bounds[0] is None or bounds[1] is None:
		return False

	return _time_window_schedule_date(weekday, bounds[0], bounds[1], now_local) is not None


def _parse_time(value: Any) -> time | None:
	if isinstance(value, time):
		return value.replace(tzinfo=None)

	normalized = ' '.join(str(value or '').strip().upper().split())
	if not normalized:
		return None

	for pattern in ('%H:%M', '%H:%M:%S', '%I:%M %p', '%I:%M%p', '%I %p', '%I%p'):
		try:
			return datetime.strptime(normalized, pattern).time()
		except ValueError:
			continue
	return None


def _parse_date(value: Any) -> date | None:
	if isinstance(value, datetime):
		return value.date()
	if isinstance(value, date):
		return value

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


def _deal_active_on_date(deal: dict[str, Any], local_date: date) -> bool:
	raw_starts_on = deal.get('starts_on')
	raw_ends_on = deal.get('ends_on')
	starts_on = _parse_date(raw_starts_on)
	ends_on = _parse_date(raw_ends_on)
	if raw_starts_on not in (None, '') and starts_on is None:
		return False
	if raw_ends_on not in (None, '') and ends_on is None:
		return False
	if starts_on and local_date < starts_on:
		return False
	if ends_on and local_date > ends_on:
		return False
	return True


def _active_window_schedule_date(window: dict[str, Any], now_local: datetime) -> date | None:
	weekday = _parse_weekday(window.get('weekday'))
	if weekday is None:
		return None

	if _is_truthy(window.get('all_day')):
		return now_local.date() if weekday == now_local.weekday() else None

	bounds = _window_bounds(window)
	if bounds is None:
		return None

	return _time_window_schedule_date(
		window_weekday=weekday,
		start_time=bounds[0],
		end_time=bounds[1],
		now_local=now_local,
	)


def _time_window_schedule_date(
	window_weekday: int,
	start_time: time,
	end_time: time,
	now_local: datetime,
) -> date | None:
	current_time = now_local.time().replace(tzinfo=None)
	if start_time >= end_time:
		if start_time == end_time:
			return None
		if window_weekday == now_local.weekday() and current_time >= start_time:
			return now_local.date()
		previous_weekday = (now_local.weekday() - 1) % 7
		if window_weekday == previous_weekday and current_time < end_time:
			return now_local.date() - timedelta(days=1)
		return None

	if window_weekday == now_local.weekday() and start_time <= current_time < end_time:
		return now_local.date()
	return None


def _window_is_active(window: dict[str, Any], now_local: datetime) -> bool:
	return _active_window_schedule_date(window, now_local) is not None


def _window_bounds(window: dict[str, Any]) -> tuple[time, time] | None:
	start_time = _parse_time(window.get('start_time'))
	end_time = _parse_time(window.get('end_time'))
	if start_time is None or end_time is None:
		return None
	return start_time, end_time


def _build_place_row(
	payload: dict[str, Any],
	location: dict[str, Any],
	active_windows: list[dict[str, object]],
) -> dict[str, object] | None:
	slug = str(payload.get('slug') or location.get('slug') or '').strip()
	location_id = _coerce_integer(location.get('id', payload.get('id')))
	if not slug or location_id is None:
		return None

	raw_image_urls = location.get('image_urls') or payload.get('image_urls') or []
	if isinstance(raw_image_urls, str):
		raw_image_urls = [raw_image_urls]
	image_urls = [str(image_url).strip() for image_url in raw_image_urls if str(image_url).strip()]

	return {
		'slug': slug,
		'location_id': location_id,
		'name': str(location.get('name') or payload.get('name') or 'Business').strip() or 'Business',
		'city': str(location.get('city') or payload.get('city') or '').strip().lower(),
		'city_label': str(location.get('city_label') or payload.get('city_label') or '').strip(),
		'venue_type_label': str(location.get('venue_type_label') or payload.get('venue_type_label') or '').strip(),
		'address_line_1': str(location.get('address_line_1') or payload.get('address_line_1') or '').strip(),
		'address_line_2': str(location.get('address_line_2') or payload.get('address_line_2') or '').strip(),
		'latitude': _coerce_float(location.get('latitude', payload.get('latitude'))),
		'longitude': _coerce_float(location.get('longitude', payload.get('longitude'))),
		'image_urls': image_urls,
		'happy_hours': active_windows,
	}


def _parse_weekday(value: Any) -> int | None:
	if isinstance(value, bool):
		return None
	try:
		weekday = int(value)
	except (TypeError, ValueError):
		return None
	return weekday if 0 <= weekday <= 6 else None


def _coerce_integer(value: Any) -> int | None:
	if value is None or isinstance(value, bool):
		return None
	try:
		return int(value)
	except (TypeError, ValueError):
		return None


def _coerce_float(value: Any) -> float | None:
	if value is None or value == '':
		return None
	try:
		return float(value)
	except (TypeError, ValueError):
		return None


def _is_truthy(value: Any) -> bool:
	if isinstance(value, str):
		return value.strip().lower() in {'1', 'true', 'yes', 'on'}
	return bool(value)


def _window_identity(window: object) -> tuple[object, ...]:
	if not isinstance(window, dict):
		return (str(window),)
	return (
		window.get('deal_id'),
		window.get('title'),
		window.get('price_text'),
		window.get('weekday_label'),
		window.get('start_time'),
		window.get('end_time'),
		window.get('all_day'),
	)
