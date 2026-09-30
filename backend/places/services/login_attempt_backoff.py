"""Short-lived, cache-backed delay for repeated failed profile logins."""

import hashlib
import hmac
import math
import time
from dataclasses import dataclass

from django.conf import settings
from django.core.cache import cache


FAILURE_WINDOW_SECONDS = 15 * 60
MAX_BACKOFF_SECONDS = 60
DEFAULT_ACCOUNT_FAILURE_RATE = '5/minute'


@dataclass(frozen=True)
class LoginFailureResult:
	wait_seconds: int = 0
	account_limited: bool = False


def _cache_keys(identifier):
	normalized_identifier = str(identifier or '').strip().lower()
	if not normalized_identifier:
		return None, None

	secret = str(getattr(settings, 'SECRET_KEY', '') or '').encode('utf-8')
	digest = hmac.new(secret, normalized_identifier.encode('utf-8'), hashlib.sha256).hexdigest()
	key_prefix = f'places:profile-login:{digest}'
	return f'{key_prefix}:failures', f'{key_prefix}:cooldown'


def _account_failure_rate():
	configured_rates = getattr(settings, 'REST_FRAMEWORK', {}).get('DEFAULT_THROTTLE_RATES', {})
	rate = configured_rates.get('profile_login') or DEFAULT_ACCOUNT_FAILURE_RATE
	try:
		count, period = rate.split('/', 1)
		duration = {'s': 1, 'm': 60, 'h': 3600, 'd': 86400}[period.strip().lower()[0]]
		return int(count), duration
	except Exception:
		count, period = DEFAULT_ACCOUNT_FAILURE_RATE.split('/', 1)
		return int(count), {'s': 1, 'm': 60, 'h': 3600, 'd': 86400}[period[0]]


def _consume_account_failure_slot(identifier, now):
	"""Count failed passwords in a fixed window, returning wait when over limit."""
	failure_key, _ = _cache_keys(identifier)
	if failure_key is None:
		return 0

	limit, duration = _account_failure_rate()
	count_key = f'{failure_key}:minute'
	expires_key = f'{failure_key}:minute-expires'
	try:
		if cache.add(count_key, 1, timeout=duration):
			count = 1
			cache.set(expires_key, now + duration, timeout=duration + 1)
		else:
			try:
				count = cache.incr(count_key)
			except ValueError:
				if cache.add(count_key, 1, timeout=duration):
					count = 1
					cache.set(expires_key, now + duration, timeout=duration + 1)
				else:
					count = cache.incr(count_key)
					cache.add(expires_key, now + duration, timeout=duration + 1)
			expires_at = cache.get(expires_key)
			if expires_at is None:
				expires_at = now + duration
				cache.add(expires_key, expires_at, timeout=duration + 1)
		if count > limit:
			expires_at = cache.get(expires_key) or now + duration
			return max(1, math.ceil(float(expires_at) - now))
		return 0
	except Exception:
		# Preserve the app's availability-first posture if Redis is unavailable.
		return 0


def get_login_backoff_wait(identifier):
	"""Return remaining failed-password cooldown seconds, or zero if none."""
	failure_key, cooldown_key = _cache_keys(identifier)
	if failure_key is None:
		return 0

	try:
		cooldown_until = cache.get(cooldown_key)
		if cooldown_until is None:
			return 0
		return max(0, math.ceil(float(cooldown_until) - time.time()))
	except Exception:
		# Match the application's availability-first cache posture: an outage must
		# not make every user unable to log in.
		return 0


def record_failed_password_during_cooldown(identifier):
	"""Count a bad-password retry without extending its current cooldown."""
	try:
		return _consume_account_failure_slot(identifier, time.time())
	except Exception:
		return 0


def record_failed_login(identifier):
	"""Count an incorrect password and return its rate/backoff result.

	At most five failed password checks per account are accepted in the configured
	per-minute window. This limit only applies after a password actually fails: a
	correct password is checked and allowed even if an attacker has used those
	failed attempts. The first two consecutive failures are not delayed. From the
	third, the cooldown doubles up to one minute. A later request during an active
	cooldown should be rejected by the caller without calling this function, so
	automated traffic cannot extend the delay by retrying early.
	"""
	failure_key, cooldown_key = _cache_keys(identifier)
	if failure_key is None:
		return LoginFailureResult()

	now = time.time()
	account_wait = _consume_account_failure_slot(identifier, now)
	if account_wait > 0:
		return LoginFailureResult(wait_seconds=account_wait, account_limited=True)

	try:
		if cache.add(failure_key, 1, timeout=FAILURE_WINDOW_SECONDS):
			failure_count = 1
		else:
			try:
				failure_count = cache.incr(failure_key)
			except ValueError:
				# The counter may have expired between add() and incr().
				if cache.add(failure_key, 1, timeout=FAILURE_WINDOW_SECONDS):
					failure_count = 1
				else:
					failure_count = cache.incr(failure_key)
			cache.touch(failure_key, timeout=FAILURE_WINDOW_SECONDS)
	except Exception:
		return LoginFailureResult()

	if not isinstance(failure_count, int) or failure_count < 1:
		# django-redis may return None when IGNORE_EXCEPTIONS is enabled.
		return LoginFailureResult()
	if failure_count <= 2:
		return LoginFailureResult()
	backoff_steps = min(failure_count - 2, 6)
	backoff_seconds = min(MAX_BACKOFF_SECONDS, 2 ** backoff_steps)
	cooldown_until = now + backoff_seconds
	try:
		# Preserve the longest wait if concurrent failures finish out of order.
		previous_until = cache.get(cooldown_key)
		if previous_until is not None:
			cooldown_until = max(cooldown_until, float(previous_until))
		remaining = max(1, math.ceil(cooldown_until - now))
		cache.set(cooldown_key, cooldown_until, timeout=remaining + 1)
		return LoginFailureResult(wait_seconds=remaining)
	except Exception:
		return LoginFailureResult()


def clear_login_backoff(identifier):
	"""Clear accumulated failed-password state after a correct password."""
	failure_key, cooldown_key = _cache_keys(identifier)
	if failure_key is None:
		return
	try:
		cache.delete_many((failure_key, cooldown_key, f'{failure_key}:minute', f'{failure_key}:minute-expires'))
	except Exception:
		# Cache failure must not block a valid login.
		return
