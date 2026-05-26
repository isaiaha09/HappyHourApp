import json
from pathlib import Path

from django.conf import settings


SOURCE_EXCLUDED_BUSINESS_SETTINGS = {
    'here_places': 'HERE_PLACE_EXCLUDED_BUSINESSES',
    'openstreetmap_places': 'OSM_PLACE_EXCLUDED_BUSINESSES',
    'osm_places': 'OSM_PLACE_EXCLUDED_BUSINESSES',
}

SOURCE_EXCLUDED_EXTERNAL_ID_SETTINGS = {
    'here_places': 'HERE_PLACE_EXCLUDED_EXTERNAL_IDS',
    'openstreetmap_places': 'OSM_PLACE_EXCLUDED_EXTERNAL_IDS',
    'osm_places': 'OSM_PLACE_EXCLUDED_EXTERNAL_IDS',
}


def get_discovery_exclusions_path():
    configured_path = getattr(settings, 'DISCOVERY_EXCLUSIONS_PATH', '')
    if configured_path:
        return Path(configured_path)
    return Path(settings.BASE_DIR) / 'config' / 'discovery_exclusions.json'


def _normalize_lookup_text(value):
    return ''.join(character.lower() for character in str(value or '').strip() if character.isalnum())


def load_discovery_exclusions():
    path = get_discovery_exclusions_path()
    if not path.exists():
        return {}

    content = path.read_text(encoding='utf-8').strip()
    if not content:
        return {}

    payload = json.loads(content)
    return payload if isinstance(payload, dict) else {}


def get_source_excluded_businesses(source_name):
    source_key = str(source_name or '').strip().lower()
    exclusions = set()

    file_payload = load_discovery_exclusions().get(source_key, {})
    for entry in file_payload.get('excluded_businesses', []):
        if not isinstance(entry, (list, tuple)) or len(entry) != 2:
            continue
        city, name = entry
        if str(city).strip() and str(name).strip():
            exclusions.add((_normalize_lookup_text(city), _normalize_lookup_text(name)))

    setting_name = SOURCE_EXCLUDED_BUSINESS_SETTINGS.get(source_key)
    if setting_name:
        for city, name in getattr(settings, setting_name, tuple()):
            if str(city).strip() and str(name).strip():
                exclusions.add((_normalize_lookup_text(city), _normalize_lookup_text(name)))

    return exclusions


def get_source_excluded_external_ids(source_name):
    source_key = str(source_name or '').strip().lower()
    exclusions = {
        str(value).strip().lower()
        for value in load_discovery_exclusions().get(source_key, {}).get('excluded_external_ids', [])
        if str(value).strip()
    }

    setting_name = SOURCE_EXCLUDED_EXTERNAL_ID_SETTINGS.get(source_key)
    if setting_name:
        exclusions.update(
            str(value).strip().lower()
            for value in getattr(settings, setting_name, tuple())
            if str(value).strip()
        )

    return exclusions
