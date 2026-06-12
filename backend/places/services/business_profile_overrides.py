import re
from hashlib import sha256

from places.models import DealType, Weekday


TIME_24_HOUR_PATTERN = re.compile(r'^(?P<hour>\d{1,2}):(?P<minute>\d{2})$')
TIME_12_HOUR_PATTERN = re.compile(r'^(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?\s*(?P<suffix>am|pm)$', re.IGNORECASE)


def _stable_numeric_id(*parts):
    raw_value = '|'.join(str(part or '') for part in parts)
    digest = sha256(raw_value.encode('utf-8')).hexdigest()
    return int(digest[:13], 16)


def _label_for_choice(choice_enum, value):
    return choice_enum(value).label


def normalize_time_value(value, field_name):
    normalized = str(value or '').strip().lower()
    if not normalized:
        raise ValueError(f'{field_name} is required.')

    match_24_hour = TIME_24_HOUR_PATTERN.match(normalized)
    if match_24_hour:
        hour = int(match_24_hour.group('hour'))
        minute = int(match_24_hour.group('minute'))
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return f'{hour:02d}:{minute:02d}'

    match_12_hour = TIME_12_HOUR_PATTERN.match(normalized)
    if match_12_hour:
        hour = int(match_12_hour.group('hour'))
        minute = int(match_12_hour.group('minute') or '0')
        suffix = match_12_hour.group('suffix').lower()
        if not (1 <= hour <= 12 and 0 <= minute <= 59):
            raise ValueError(f'{field_name} must use a real time.')
        if suffix == 'pm' and hour != 12:
            hour += 12
        if suffix == 'am' and hour == 12:
            hour = 0
        return f'{hour:02d}:{minute:02d}'

    raise ValueError(f'{field_name} must look like 11:00 AM or 23:00.')


def normalize_weekday_value(value, field_name='weekday'):
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        raise ValueError(f'{field_name} must be a valid weekday.')
    if normalized not in Weekday.values:
        raise ValueError(f'{field_name} must be a valid weekday.')
    return normalized


def is_open_24_hours_row(row):
    return bool(row.get('open_24_hours'))


def format_operating_hour_display(row):
    if is_open_24_hours_row(row):
        return 'Open 24 hours'
    return f"{format_time_display(row['open_time'])} - {format_time_display(row['close_time'])}"


def normalize_operating_hour_row_for_output(row):
    normalized_row = dict(row)
    if is_open_24_hours_row(normalized_row):
        normalized_row['open_time'] = '00:00'
        normalized_row['close_time'] = '23:59'
        normalized_row['open_24_hours'] = True
    return normalized_row


def normalize_operating_hour_overrides(raw_overrides):
    if raw_overrides in (None, ''):
        return []
    if not isinstance(raw_overrides, list):
        raise ValueError('Operating hour overrides must be a list.')

    normalized_rows = []
    for index, row in enumerate(raw_overrides):
        if not isinstance(row, dict):
            raise ValueError(f'Operating hour override #{index + 1} must be an object.')
        group_id = str(row.get('group_id') or '').strip()
        try:
            group_rank = int(row.get('group_rank')) if row.get('group_rank') not in (None, '') else None
        except (TypeError, ValueError):
            raise ValueError(f'Operating hour override #{index + 1} group rank must be a valid integer.')

        normalized_row = {
            'weekday': normalize_weekday_value(row.get('weekday')),
        }
        open_24_hours = bool(row.get('open_24_hours'))
        if open_24_hours:
            normalized_row['open_time'] = '00:00'
            normalized_row['close_time'] = '23:59'
            normalized_row['open_24_hours'] = True
        else:
            normalized_row['open_time'] = normalize_time_value(row.get('open_time'), f'Operating hour #{index + 1} open time')
            normalized_row['close_time'] = normalize_time_value(row.get('close_time'), f'Operating hour #{index + 1} close time')
        if group_id:
            normalized_row['group_id'] = group_id
        if group_rank is not None:
            normalized_row['group_rank'] = group_rank
        normalized_rows.append(normalized_row)

    return sorted(normalized_rows, key=lambda row: (row.get('group_rank', 10 ** 6), row['weekday'], row['open_time'], row['close_time']))


def normalize_deal_overrides(raw_overrides):
    if raw_overrides in (None, ''):
        return []
    if not isinstance(raw_overrides, list):
        raise ValueError('Deal overrides must be a list.')

    normalized_deals = []
    for index, row in enumerate(raw_overrides):
        if not isinstance(row, dict):
            raise ValueError(f'Deal override #{index + 1} must be an object.')

        title = str(row.get('title') or '').strip()
        description = str(row.get('description') or '').strip()
        price_text = str(row.get('price_text') or '').strip()
        terms = str(row.get('terms') or '').strip()
        deal_type = str(row.get('deal_type') or DealType.OTHER).strip().lower()
        custom_deal_type_label = str(row.get('custom_deal_type_label') or '').strip()
        if deal_type not in DealType.values:
            raise ValueError(f'Deal override #{index + 1} must use a supported deal type.')
        if deal_type == DealType.OTHER and custom_deal_type_label.lower() == DealType.OTHER.label.lower():
            custom_deal_type_label = ''
        if not title:
            raise ValueError(f'Deal override #{index + 1} needs a title.')
        happy_hours = []
        raw_happy_hours = row.get('happy_hours', [])
        if not isinstance(raw_happy_hours, list):
            raise ValueError(f'Deal override #{index + 1} happy hours must be a list.')
        for window_index, happy_hour in enumerate(raw_happy_hours):
            if not isinstance(happy_hour, dict):
                raise ValueError(f'Deal override #{index + 1} happy hour #{window_index + 1} must be an object.')
            all_day = bool(happy_hour.get('all_day'))
            normalized_window = {
                'weekday': normalize_weekday_value(happy_hour.get('weekday'), field_name=f'Deal override #{index + 1} weekday'),
                'start_time': '00:00' if all_day else normalize_time_value(happy_hour.get('start_time'), f'Deal override #{index + 1} start time'),
                'end_time': '23:59' if all_day else normalize_time_value(happy_hour.get('end_time'), f'Deal override #{index + 1} end time'),
                'all_day': all_day,
            }
            happy_hours.append(normalized_window)

        normalized_deals.append({
            'title': title,
            'description': description,
            'deal_type': deal_type,
            'custom_deal_type_label': custom_deal_type_label,
            'price_text': price_text,
            'terms': terms,
            'happy_hours': sorted(happy_hours, key=lambda window: (window['weekday'], window['start_time'], window['end_time'], window['all_day'])),
        })

    return normalized_deals


def format_time_display(value):
    hour, minute = (str(value or '00:00').split(':', 1) + ['00'])[:2]
    normalized_hour = int(hour)
    suffix = 'PM' if normalized_hour >= 12 else 'AM'
    hour12 = normalized_hour % 12 or 12
    return f'{hour12}:{minute} {suffix}'


def summarize_operating_hour_overrides(overrides):
    return [
        f"{_label_for_choice(Weekday, normalized_row['weekday'])}: {format_operating_hour_display(normalized_row)}"
        for normalized_row in (normalize_operating_hour_row_for_output(row) for row in overrides)
    ]


def summarize_deal_overrides(overrides):
    summaries = []
    for deal in overrides:
        sections = [deal['title']]
        if deal['price_text']:
            sections.append(deal['price_text'])
        if deal['description']:
            sections.append(deal['description'])
        if deal['terms']:
            sections.append(f"Terms: {deal['terms']}")
        if deal.get('custom_deal_type_label'):
            sections.append(f"Type: {deal['custom_deal_type_label']}")
        if deal['happy_hours']:
            sections.append(
                'Happy hour: ' + ', '.join(
                    f"{_label_for_choice(Weekday, window['weekday'])}: {'all day' if window['all_day'] else f'{format_time_display(window['start_time'])} - {format_time_display(window['end_time'])}'}"
                    for window in deal['happy_hours']
                )
            )
        summaries.append(' | '.join(part for part in sections if part))
    return summaries


def build_operating_hour_payloads(overrides, namespace):
    return [
        {
            'id': _stable_numeric_id(namespace, 'operating-hours', normalized_row['weekday'], normalized_row['open_time'], normalized_row['close_time']),
            'weekday': normalized_row['weekday'],
            'weekday_label': _label_for_choice(Weekday, normalized_row['weekday']),
            'open_time': normalized_row['open_time'],
            'close_time': normalized_row['close_time'],
            'open_24_hours': is_open_24_hours_row(normalized_row),
            'group_id': normalized_row.get('group_id'),
            'group_rank': normalized_row.get('group_rank'),
        }
        for normalized_row in (normalize_operating_hour_row_for_output(row) for row in overrides)
    ]


def build_deal_payloads(overrides, namespace):
    payloads = []
    for index, deal in enumerate(overrides):
        deal_identity = _stable_numeric_id(namespace, 'deal-override', deal['title'], deal['deal_type'], index)
        payloads.append({
            'id': deal_identity,
            'title': deal['title'],
            'description': deal['description'],
            'deal_type': deal['deal_type'],
            'deal_type_label': deal.get('custom_deal_type_label') or _label_for_choice(DealType, deal['deal_type']),
            'price_text': deal['price_text'],
            'terms': deal['terms'],
            'is_active': True,
            'starts_on': None,
            'ends_on': None,
            'happy_hours': [
                {
                    'id': _stable_numeric_id(namespace, deal_identity, window['weekday'], window['start_time'], window['end_time'], window['all_day']),
                    'weekday': window['weekday'],
                    'weekday_label': _label_for_choice(Weekday, window['weekday']),
                    'start_time': window['start_time'],
                    'end_time': window['end_time'],
                    'all_day': window['all_day'],
                }
                for window in deal['happy_hours']
            ],
        })
    return payloads


def build_operating_weekdays(overrides):
    return sorted({row['weekday'] for row in overrides})


def build_deal_weekdays(overrides):
    return sorted({window['weekday'] for deal in overrides for window in deal.get('happy_hours', [])})