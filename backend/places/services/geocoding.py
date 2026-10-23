import logging
import re

import requests


logger = logging.getLogger(__name__)

CENSUS_GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress'
SUBUNIT_SUFFIX_PATTERN = re.compile(r'\s+(?:suite|ste\.?|unit|apt\.?|apartment|#)\s*[A-Z0-9-]+\s*$', re.IGNORECASE)


def geocode_us_business_address(address_line_1, city, state, postal_code=''):
	"""Return Census address-range coordinates for one complete US business address."""
	street = str(address_line_1 or '').strip()
	city = str(city or '').strip()
	state = str(state or '').strip()
	postal_code = str(postal_code or '').strip()
	if not street or not city or not state:
		return None

	# Suites and units do not change the street address match and can reduce match rates.
	street = SUBUNIT_SUFFIX_PATTERN.sub('', street).strip()
	address_parts = [street, city, state]
	if postal_code:
		address_parts[-1] = f'{state} {postal_code}'
	address = ', '.join(address_parts)
	try:
		response = requests.get(
			CENSUS_GEOCODER_URL,
			params={
				'address': address,
				'benchmark': 'Public_AR_Current',
				'format': 'json',
			},
			headers={'User-Agent': 'DiningDealz/1.0 (business listing address lookup)'},
			timeout=(2, 6),
		)
		response.raise_for_status()
		payload = response.json()
	except (requests.RequestException, ValueError):
		logger.warning('Census address geocoding failed for an admin business listing.')
		return None

	if not isinstance(payload, dict):
		return None
	matches = (payload.get('result') or {}).get('addressMatches') or []
	if not matches:
		return None
	coordinates = matches[0].get('coordinates') or {}
	try:
		longitude = float(coordinates['x'])
		latitude = float(coordinates['y'])
	except (KeyError, TypeError, ValueError):
		return None
	if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
		return None
	return latitude, longitude
