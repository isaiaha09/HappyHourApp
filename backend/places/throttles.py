import hashlib
import ipaddress

from rest_framework.settings import api_settings
from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle


class ScopedRateThrottle(SimpleRateThrottle):
	scope = ''
	identity_fields = ()
	include_user_in_cache_key = True

	def get_rate(self):
		return api_settings.DEFAULT_THROTTLE_RATES.get(self.scope)

	def get_cache_key(self, request, view):
		if not self.scope:
			return None

		ident_parts = [self.get_ident(request)]
		for field_name in self.identity_fields:
			value = str(request.data.get(field_name) or '').strip().lower()
			if value:
				ident_parts.append(f'{field_name}:{value}')

		if self.include_user_in_cache_key and getattr(request.user, 'is_authenticated', False):
			ident_parts.append(f'user:{request.user.pk}')

		ident = hashlib.sha256('|'.join(ident_parts).encode('utf-8')).hexdigest()
		return self.cache_format % {
			'scope': self.scope,
			'ident': ident,
		}


class LoginRateThrottle(ScopedRateThrottle):
	scope = 'profile_login'
	identity_fields = ('identifier', 'portal')


class SignupRateThrottle(ScopedRateThrottle):
	scope = 'profile_signup'
	identity_fields = ('email',)


class SignupIpRateThrottle(ScopedRateThrottle):
	scope = 'profile_signup_ip'
	include_user_in_cache_key = False

	def get_ident(self, request):
		# Render's Cloudflare edge overwrites CF-Connecting-IP with the client IP.
		# Do not trust X-Forwarded-For here; clients can supply its leftmost value.
		forwarded_ip = str(request.META.get('HTTP_CF_CONNECTING_IP') or '').strip()
		try:
			return str(ipaddress.ip_address(forwarded_ip))
		except ValueError:
			remote_addr = str(request.META.get('REMOTE_ADDR') or '').strip()
			try:
				return str(ipaddress.ip_address(remote_addr))
			except ValueError:
				return 'unknown'


class EmailVerificationRateThrottle(ScopedRateThrottle):
	scope = 'profile_email_verification'
	identity_fields = ('username', 'portal')


class EmailVerificationResendRateThrottle(ScopedRateThrottle):
	scope = 'profile_email_verification_resend'
	identity_fields = ('username', 'portal')


class PasswordRecoveryRateThrottle(ScopedRateThrottle):
	scope = 'profile_password_recovery'
	identity_fields = ('identifier', 'email')


class SupportContactRateThrottle(ScopedRateThrottle):
	scope = 'profile_support_contact'


class WebsiteContactRateThrottle(ScopedRateThrottle):
	scope = 'website_contact'

	def get_ident(self, request):
		forwarded_ip = str(request.META.get('HTTP_X_CONTACT_CLIENT_IP') or '').strip()
		try:
			return str(ipaddress.ip_address(forwarded_ip))
		except ValueError:
			return super().get_ident(request)


class ContentReportRateThrottle(ScopedRateThrottle):
	scope = 'profile_content_report'
	identity_fields = ('target_type', 'post_id', 'message_id', 'listing_slug')


class UserMutationRateThrottle(ScopedRateThrottle):
	scope = 'profile_user_mutation'


class DirectMessageSendRateThrottle(ScopedRateThrottle):
	scope = 'direct_message_send'


class TwoFactorRateThrottle(ScopedRateThrottle):
	scope = 'profile_two_factor'


class NotificationProcessorRateThrottle(AnonRateThrottle):
	scope = 'internal_notification_processor'
