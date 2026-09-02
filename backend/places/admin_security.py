import base64
import hashlib
import hmac
import ipaddress
import json
import logging
import time
from io import BytesIO
from urllib.parse import urlencode

from django import forms
from django.conf import settings
from django.contrib.admin.forms import AdminAuthenticationForm as DjangoAdminAuthenticationForm
from django.contrib.auth import logout
from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.http import HttpResponseForbidden, HttpResponseRedirect
from django.urls import reverse

from .models import AccountProfile


security_logger = logging.getLogger('admin_security')
ADMIN_LAST_ACTIVITY_SESSION_KEY = '_happyhour_admin_last_activity'
ADMIN_SESSION_STARTED_SESSION_KEY = '_happyhour_admin_session_started'
ADMIN_MFA_VERIFIED_SESSION_KEY = '_happyhour_admin_mfa_secret_digest'


def emit_admin_security_event(request, event_type, actor=None, log_level=logging.INFO, **details):
	"""Emit a secret-free, structured event for an external log drain or SIEM."""
	request_user = getattr(request, 'user', None) if request is not None else None
	actor_id = getattr(actor, 'pk', None) or getattr(request_user, 'pk', None)
	remote_addr = ''
	path = ''
	if request is not None:
		remote_addr = str(getattr(request, 'META', {}).get('REMOTE_ADDR') or '')[:64]
		path = str(getattr(request, 'path_info', '') or '')[:512]

	alert_events = getattr(
		settings,
		'ADMIN_SECURITY_ALERT_EVENTS',
		(
			'admin_privilege_change',
			'admin_ip_denied',
			'admin_mfa_failure',
			'admin_mfa_enrollment_failure',
			'admin_mfa_disabled',
			'admin_mfa_misconfigured',
			'admin_mfa_session_required',
			'admin_login_rate_limited',
			'profile_auth_tokens_revoked',
		),
	)
	payload = {
		'event_type': str(event_type),
		'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
		'actor_id': actor_id,
		'path': path,
		'remote_addr': remote_addr,
		'alert': str(event_type) in set(alert_events or ()),
		**details,
	}
	security_logger.log(
		log_level,
		'ADMIN_SECURITY_EVENT %s',
		json.dumps(payload, sort_keys=True, separators=(',', ':'), default=str),
	)


def build_admin_mfa_qr_data_uri(provisioning_uri):
	"""Build an inline QR image without sending the TOTP secret to a third party."""
	provisioning_uri = str(provisioning_uri or '').strip()
	if not provisioning_uri:
		return ''

	try:
		import qrcode
	except ImportError as exc:  # pragma: no cover - deployment dependency is installed from requirements.txt
		raise RuntimeError('The qrcode dependency is required for admin MFA enrollment.') from exc

	qr = qrcode.QRCode(
		version=None,
		error_correction=qrcode.constants.ERROR_CORRECT_M,
		box_size=8,
		border=4,
	)
	qr.add_data(provisioning_uri)
	qr.make(fit=True)
	image = qr.make_image(fill_color='black', back_color='white')
	output = BytesIO()
	try:
		image.save(output)
	finally:
		close = getattr(image, 'close', None)
		if callable(close):
			close()
	return f"data:image/png;base64,{base64.b64encode(output.getvalue()).decode('ascii')}"


def _setting_seconds(name, default):
	try:
		return max(int(getattr(settings, name, default) or default), 60)
	except (TypeError, ValueError):
		return default


def _admin_login_limits():
	return (
		_setting_seconds('ADMIN_LOGIN_WINDOW_SECONDS', 300),
		max(int(getattr(settings, 'ADMIN_LOGIN_MAX_ATTEMPTS', 5) or 5), 1),
	)


def _digest_rate_value(value):
	return hashlib.sha256(str(value or '').encode('utf-8')).hexdigest()[:32]


def _admin_auth_cache_keys(prefix, request, username):
	remote_addr = str(getattr(request, 'META', {}).get('REMOTE_ADDR') or 'unknown')
	normalized_username = str(username or '').strip().casefold()
	if not normalized_username:
		return []
	return (
		f'{prefix}-ip:{_digest_rate_value(remote_addr)}',
		f'{prefix}-pair:{_digest_rate_value(f"{remote_addr}|{normalized_username}")}',
	)


def _read_admin_attempts(keys):
	if not keys:
		return 0
	try:
		return max(int(cache.get(key) or 0) for key in keys)
	except Exception:
		security_logger.exception('Could not read admin login rate-limit state.')
		return 0


def _record_admin_attempts(keys, window_seconds):
	if not keys:
		return 0
	counts = []
	for key in keys:
		try:
			if cache.add(key, 1, timeout=window_seconds):
				counts.append(1)
				continue
			try:
				counts.append(int(cache.incr(key)))
			except ValueError:
				cache.set(key, 1, timeout=window_seconds)
				counts.append(1)
		except Exception:
			security_logger.exception('Could not update admin login rate-limit state.')
	return max(counts or [0])


def _clear_admin_attempts(keys):
	if not keys:
		return
	try:
		for key in keys:
			cache.delete(key)
	except Exception:
		security_logger.exception('Could not clear admin login rate-limit state.')


def _admin_login_cache_keys(request, username):
	return _admin_auth_cache_keys('admin-login', request, username)


def _admin_mfa_cache_keys(request, username):
	return _admin_auth_cache_keys('admin-mfa', request, username)


def _read_admin_login_attempts(request, username):
	return _read_admin_attempts(_admin_login_cache_keys(request, username))


def _record_admin_login_failure(request, username):
	window_seconds, _max_attempts = _admin_login_limits()
	return _record_admin_attempts(_admin_login_cache_keys(request, username), window_seconds)


def _clear_admin_login_pair(request, username):
	_clear_admin_attempts(_admin_login_cache_keys(request, username))


def _read_admin_mfa_attempts(request, username):
	return _read_admin_attempts(_admin_mfa_cache_keys(request, username))


def _record_admin_mfa_failure(request, username):
	window_seconds, _max_attempts = _admin_login_limits()
	return _record_admin_attempts(_admin_mfa_cache_keys(request, username), window_seconds)


def _clear_admin_mfa_pair(request, username):
	_clear_admin_attempts(_admin_mfa_cache_keys(request, username))


def _get_admin_mfa_profile(user):
	if not user or not getattr(user, 'pk', None):
		return None
	return AccountProfile.objects.filter(user_id=user.pk).only(
		'admin_two_factor_enabled',
		'admin_two_factor_secret',
	).first()


def _admin_user_requires_mfa(user):
	profile = _get_admin_mfa_profile(user)
	return bool(profile and profile.admin_two_factor_enabled)


class AdminMFACodeForm(forms.Form):
	otp_code = forms.CharField(
		label='Authenticator code',
		required=True,
		max_length=12,
		strip=True,
		widget=forms.TextInput(attrs={
			'autocomplete': 'one-time-code',
			'inputmode': 'numeric',
			'pattern': '[0-9]*',
		}),
	)

	def clean_otp_code(self):
		normalized = ''.join(character for character in self.cleaned_data['otp_code'] if character.isdigit())
		if len(normalized) != 6:
			raise ValidationError('Enter the six-digit authenticator code.')
		return normalized


class AdminAuthenticationForm(DjangoAdminAuthenticationForm):

	def clean(self):
		username = str(self.data.get('username') or '').strip()
		password = self.data.get('password')
		_max_window, max_attempts = _admin_login_limits()
		if username and password and _read_admin_login_attempts(self.request, username) >= max_attempts:
			emit_admin_security_event(
				self.request,
				'admin_login_rate_limited',
				log_level=logging.WARNING,
				username_hash=_digest_rate_value(username.casefold()),
			)
			raise ValidationError('Too many failed admin sign-in attempts. Try again later.')

		try:
			cleaned_data = super().clean()
			user = self.get_user()
			if user is None:
				return cleaned_data

			_clear_admin_login_pair(self.request, username)
			setattr(self.request, '_admin_login_success', True)
			setattr(self.request, '_admin_login_requires_mfa', _admin_user_requires_mfa(user))
			emit_admin_security_event(self.request, 'admin_password_login_success', actor=user)
			return cleaned_data
		except ValidationError:
			if username and password:
				attempts = _record_admin_login_failure(self.request, username)
				event_type = 'admin_login_rate_limited' if attempts >= max_attempts else 'admin_login_failure'
				failed_user = self.get_user()
				emit_admin_security_event(
					self.request,
					event_type,
					actor=failed_user,
					log_level=logging.WARNING,
					username_hash=_digest_rate_value(username.casefold()),
					reason='invalid_credentials',
					attempts=attempts,
				)
			raise


def _admin_mfa_secret_digest(profile):
	return hashlib.sha256(str(profile.admin_two_factor_secret).encode('utf-8')).hexdigest()


def mark_admin_mfa_verified(request, user=None):
	user = user or getattr(request, 'user', None)
	profile = _get_admin_mfa_profile(user)
	if profile and profile.admin_two_factor_enabled and profile.admin_two_factor_secret:
		request.session[ADMIN_MFA_VERIFIED_SESSION_KEY] = _admin_mfa_secret_digest(profile)
	else:
		request.session.pop(ADMIN_MFA_VERIFIED_SESSION_KEY, None)


def admin_mfa_session_verified(request, user=None):
	user = user or getattr(request, 'user', None)
	if not _admin_user_requires_mfa(user):
		return True
	profile = _get_admin_mfa_profile(user)
	if not profile or not profile.admin_two_factor_secret:
		return False
	return hmac.compare_digest(
		str(request.session.get(ADMIN_MFA_VERIFIED_SESSION_KEY) or ''),
		_admin_mfa_secret_digest(profile),
	)


def authenticate_admin_mfa(request, user, code):
	username = str(getattr(user, 'username', '') or '')
	_max_window, max_attempts = _admin_login_limits()
	if _read_admin_mfa_attempts(request, username) >= max_attempts:
		emit_admin_security_event(
			request,
			'admin_login_rate_limited',
			actor=user,
			log_level=logging.WARNING,
			reason='mfa_attempts',
		)
		return 'rate_limited'

	profile = _get_admin_mfa_profile(user)
	if profile and profile.admin_two_factor_enabled and profile.admin_two_factor_secret and profile.verify_admin_two_factor_code(code):
		_clear_admin_mfa_pair(request, username)
		mark_admin_mfa_verified(request, user)
		emit_admin_security_event(request, 'admin_login_success', actor=user)
		return 'success'

	attempts = _record_admin_mfa_failure(request, username)
	emit_admin_security_event(
		request,
		'admin_mfa_failure',
		actor=user,
		log_level=logging.WARNING,
		attempts=attempts,
	)
	return 'invalid'


def _admin_path_matches(request):
	admin_path = str(getattr(settings, 'ADMIN_URL_PATH', 'admin') or 'admin').strip('/')
	admin_prefix = f'/{admin_path}/'
	path = str(getattr(request, 'path_info', '') or '')
	return path == admin_prefix[:-1] or path.startswith(admin_prefix)


def _admin_route_matches(request, route):
	admin_path = str(getattr(settings, 'ADMIN_URL_PATH', 'admin') or 'admin').strip('/')
	return str(getattr(request, 'path_info', '') or '').rstrip('/') == f'/{admin_path}/{route}'


def _admin_mfa_path_matches(request):
	return _admin_route_matches(request, 'mfa')


def _admin_logout_path_matches(request):
	return _admin_route_matches(request, 'logout')


def _admin_ip_allowed(request):
	configured_ranges = getattr(settings, 'ADMIN_IP_ALLOWLIST', ()) or ()
	if isinstance(configured_ranges, str):
		configured_ranges = (configured_ranges,)
	if not configured_ranges:
		return True

	try:
		remote_addr = ipaddress.ip_address(str(getattr(request, 'META', {}).get('REMOTE_ADDR') or ''))
	except ValueError:
		return False

	for configured_range in configured_ranges:
		try:
			if remote_addr in ipaddress.ip_network(str(configured_range).strip(), strict=False):
				return True
		except ValueError:
			continue
	return False


def _admin_session_expired(request):
	now = time.time()
	last_activity = request.session.get(ADMIN_LAST_ACTIVITY_SESSION_KEY)
	started_at = request.session.get(ADMIN_SESSION_STARTED_SESSION_KEY)
	try:
		if started_at not in (None, '') and now - float(started_at) > _setting_seconds('ADMIN_SESSION_AGE_SECONDS', 3600):
			return True
		if last_activity in (None, ''):
			return False
		return now - float(last_activity) > _setting_seconds('ADMIN_SESSION_IDLE_TIMEOUT_SECONDS', 1800)
	except (TypeError, ValueError):
		return True


def mark_admin_session_active(request, mfa_verified=None, start_session=False, user=None):
	now = int(time.time())
	if start_session or not request.session.get(ADMIN_SESSION_STARTED_SESSION_KEY):
		request.session[ADMIN_SESSION_STARTED_SESSION_KEY] = now
	request.session[ADMIN_LAST_ACTIVITY_SESSION_KEY] = now
	request.session.set_expiry(_setting_seconds('ADMIN_SESSION_AGE_SECONDS', 3600))
	if mfa_verified is not None:
		if mfa_verified:
			mark_admin_mfa_verified(request, user=user)
		else:
			request.session.pop(ADMIN_MFA_VERIFIED_SESSION_KEY, None)


def _admin_login_redirect(request):
	login_url = reverse('happyhour_admin:login')
	return HttpResponseRedirect(f'{login_url}?{urlencode({"next": request.get_full_path()})}')


def _admin_mfa_redirect(request):
	mfa_url = reverse('happyhour_admin:mfa')
	return HttpResponseRedirect(f'{mfa_url}?{urlencode({"next": request.get_full_path()})}')


class AdminSecurityMiddleware:
	"""Apply admin-only network and session controls after auth middleware."""

	def __init__(self, get_response):
		self.get_response = get_response

	def __call__(self, request):
		if not _admin_path_matches(request):
			return self.get_response(request)

		if not _admin_ip_allowed(request):
			emit_admin_security_event(
				request,
				'admin_ip_denied',
				log_level=logging.WARNING,
			)
			return HttpResponseForbidden('Admin access is restricted from this network.')

		user = getattr(request, 'user', None)
		if getattr(user, 'is_authenticated', False) and getattr(user, 'is_staff', False):
			if _admin_session_expired(request):
				emit_admin_security_event(request, 'admin_session_expired', actor=user, log_level=logging.WARNING)
				logout(request)
				return _admin_login_redirect(request)
			if (
				_admin_user_requires_mfa(user)
				and not admin_mfa_session_verified(request, user)
				and not _admin_mfa_path_matches(request)
				and not _admin_logout_path_matches(request)
			):
				emit_admin_security_event(request, 'admin_mfa_session_required', actor=user, log_level=logging.WARNING)
				return _admin_mfa_redirect(request)
			mark_admin_session_active(request)

		response = self.get_response(request)
		user = getattr(request, 'user', None)
		if getattr(user, 'is_authenticated', False) and getattr(user, 'is_staff', False):
			mark_admin_session_active(request)
		return response
