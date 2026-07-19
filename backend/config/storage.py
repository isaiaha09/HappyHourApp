from urllib.parse import quote

from django.conf import settings
from storages.backends.s3 import S3Storage


class SupabaseMediaStorage(S3Storage):
	default_acl = 'public-read'
	file_overwrite = False
	querystring_auth = False

	def url(self, name, parameters=None, expire=None, http_method=None):
		public_base = str(getattr(settings, 'SUPABASE_STORAGE_PUBLIC_URL_BASE', '') or '').strip().rstrip('/')
		if public_base:
			normalized_name = quote(str(name or '').lstrip('/')).replace('%2F', '/')
			return f'{public_base}/{normalized_name}'
		return super().url(name, parameters=parameters, expire=expire, http_method=http_method)


class SupabasePrivateMediaStorage(S3Storage):
	default_acl = 'private'
	file_overwrite = False
	querystring_auth = True