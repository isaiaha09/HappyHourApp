import hashlib

from rest_framework.settings import api_settings
from rest_framework.throttling import SimpleRateThrottle


class ScopedRateThrottle(SimpleRateThrottle):
	scope = ''
	identity_fields = ()

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

		if getattr(request.user, 'is_authenticated', False):
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


class UserMutationRateThrottle(ScopedRateThrottle):
	scope = 'profile_user_mutation'


class DirectMessageSendRateThrottle(ScopedRateThrottle):
	scope = 'direct_message_send'