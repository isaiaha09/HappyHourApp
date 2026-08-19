"""Read-only Render PostgreSQL storage metrics for the admin UI."""

import logging

import requests
from django.conf import settings


LOGGER = logging.getLogger(__name__)
RENDER_METRICS_BASE_URL = 'https://api.render.com/v1/metrics'
METRIC_RESOLUTION_SECONDS = 60

_UNIT_FACTORS = {
    'b': 1,
    'byte': 1,
    'bytes': 1,
    'kb': 1024,
    'kib': 1024,
    'kilobyte': 1024,
    'kilobytes': 1024,
    'mb': 1024 ** 2,
    'mib': 1024 ** 2,
    'megabyte': 1024 ** 2,
    'megabytes': 1024 ** 2,
    'gb': 1024 ** 3,
    'gib': 1024 ** 3,
    'gigabyte': 1024 ** 3,
    'gigabytes': 1024 ** 3,
    'tb': 1024 ** 4,
    'tib': 1024 ** 4,
    'terabyte': 1024 ** 4,
    'terabytes': 1024 ** 4,
}


def _empty_result(configured=False):
    return {
        'configured': configured,
        'available': False,
        'usage_bytes': None,
        'capacity_bytes': None,
        'usage_percent': None,
        'usage_timestamp': None,
        'capacity_timestamp': None,
    }


def _series_list(payload):
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []

    if isinstance(payload.get('values'), list):
        return [payload]

    for key in ('data', 'results', 'series'):
        value = payload.get(key)
        if isinstance(value, list):
            return value
    return []


def _resource_series(payload, resource_id):
    series = _series_list(payload)
    matching = []
    for item in series:
        if not isinstance(item, dict) or not isinstance(item.get('values'), list):
            continue
        labels = item.get('labels') or []
        label_values = {
            str(label.get('value'))
            for label in labels
            if isinstance(label, dict) and label.get('value') is not None
        }
        if resource_id in label_values:
            matching.append(item)

    return matching or [item for item in series if isinstance(item, dict) and isinstance(item.get('values'), list)]


def _latest_metric_value(payload, resource_id):
    candidates = []
    for item in _resource_series(payload, resource_id):
        unit = str(item.get('unit') or 'bytes').strip().lower()
        factor = _UNIT_FACTORS.get(unit)
        if factor is None:
            LOGGER.warning('Render storage metric returned an unsupported unit: %s', unit)
            continue

        for value in item.get('values') or []:
            if not isinstance(value, dict) or value.get('value') is None:
                continue
            try:
                numeric_value = float(value['value'])
            except (TypeError, ValueError):
                continue
            candidates.append(
                (
                    str(value.get('timestamp') or ''),
                    int(numeric_value * factor),
                )
            )

    if not candidates:
        return None, None

    timestamp, metric_bytes = max(candidates, key=lambda item: item[0])
    return metric_bytes, timestamp or None


def _fetch_metric(metric_name, api_key, resource_id, timeout):
    response = requests.get(
        f'{RENDER_METRICS_BASE_URL}/{metric_name}',
        params={
            'resource': resource_id,
            'resolutionSeconds': METRIC_RESOLUTION_SECONDS,
        },
        headers={
            'Accept': 'application/json',
            'Authorization': f'Bearer {api_key}',
        },
        timeout=timeout,
    )
    response.raise_for_status()
    return response.json()


def fetch_render_storage():
    """Fetch the latest Render disk usage and capacity values.

    This function is intentionally read-only. Missing configuration or an API
    failure returns an unavailable result so the admin can continue loading.
    """
    if not getattr(settings, 'RENDER_STORAGE_ENABLED', True):
        return _empty_result(configured=False)

    api_key = str(getattr(settings, 'RENDER_API_KEY', '') or '').strip()
    resource_id = str(getattr(settings, 'RENDER_POSTGRES_ID', '') or '').strip()
    if not api_key or not resource_id:
        return _empty_result(configured=False)

    try:
        timeout = max(float(getattr(settings, 'RENDER_METRICS_TIMEOUT_SECONDS', 2)), 0.5)
    except (TypeError, ValueError):
        timeout = 2.0

    try:
        usage_payload = _fetch_metric('disk-usage', api_key, resource_id, timeout)
        usage_bytes, usage_timestamp = _latest_metric_value(usage_payload, resource_id)
    except (requests.RequestException, ValueError, TypeError) as exc:
        LOGGER.warning('Unable to read Render disk usage: %s', exc)
        return _empty_result(configured=True)

    try:
        capacity_payload = _fetch_metric('disk-capacity', api_key, resource_id, timeout)
        capacity_bytes, capacity_timestamp = _latest_metric_value(capacity_payload, resource_id)
    except (requests.RequestException, ValueError, TypeError) as exc:
        LOGGER.warning('Unable to read Render disk capacity: %s', exc)
        capacity_bytes, capacity_timestamp = None, None

    usage_percent = None
    if usage_bytes is not None and capacity_bytes:
        usage_percent = (usage_bytes / capacity_bytes) * 100

    return {
        'configured': True,
        'available': usage_bytes is not None,
        'usage_bytes': usage_bytes,
        'capacity_bytes': capacity_bytes,
        'usage_percent': usage_percent,
        'usage_timestamp': usage_timestamp,
        'capacity_timestamp': capacity_timestamp,
    }
