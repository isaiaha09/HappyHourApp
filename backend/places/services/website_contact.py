import ipaddress

import requests
from django.conf import settings


TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'


def verify_contact_turnstile(token, remote_ip=None):
	secret = str(getattr(settings, 'CLOUDFLARE_TURNSTILE_SECRET_KEY', '') or '').strip()
	if not secret:
		return {'status': 'unavailable', 'message': 'The website contact form is temporarily unavailable.'}
	if not str(token or '').strip():
		return {'status': 'invalid', 'message': 'Complete the security check and try again.'}

	payload = {'secret': secret, 'response': str(token).strip()}
	try:
		normalized_ip = str(ipaddress.ip_address(str(remote_ip or '').strip()))
	except ValueError:
		normalized_ip = ''
	if normalized_ip:
		payload['remoteip'] = normalized_ip

	try:
		response = requests.post(TURNSTILE_VERIFY_URL, data=payload, timeout=(3.05, 5))
		response.raise_for_status()
		data = response.json()
	except (requests.RequestException, ValueError):
		return {'status': 'unavailable', 'message': 'Unable to verify the security check right now.'}

	if not isinstance(data, dict):
		return {'status': 'unavailable', 'message': 'Unable to verify the security check right now.'}
	if data.get('success') is True:
		return {'status': 'success', 'message': ''}

	error_codes = data.get('error-codes', [])
	if not isinstance(error_codes, list):
		error_codes = []
	if 'timeout-or-duplicate' in error_codes:
		message = 'The security check expired. Please complete it again.'
	elif 'missing-input-response' in error_codes or 'invalid-input-response' in error_codes:
		message = 'Complete the security check and try again.'
	else:
		message = 'The security check could not be verified.'
	return {'status': 'invalid', 'message': message}
