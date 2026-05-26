from rest_framework import authentication, exceptions

from .models import ProfileAuthToken


class ProfileTokenAuthentication(authentication.BaseAuthentication):
	keyword = 'Token'

	def authenticate(self, request):
		auth_header = authentication.get_authorization_header(request).decode('utf-8')
		token_key = ''
		if auth_header:
			parts = auth_header.split()
			if len(parts) == 2 and parts[0].lower() == self.keyword.lower():
				token_key = parts[1].strip()
		if not token_key:
			token_key = str(request.headers.get('X-Profile-Token') or '').strip()
		if not token_key:
			return None

		token = ProfileAuthToken.objects.select_related('user').filter(key=token_key).first()
		if token is None:
			raise exceptions.AuthenticationFailed('Invalid profile token.')

		token.save(update_fields=['last_used_at'])
		return (token.user, token)