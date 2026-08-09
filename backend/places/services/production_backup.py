from pathlib import Path, PurePosixPath

from django.conf import settings


def get_supabase_bucket_configs():
	return (
		{
			'label': 'public-media',
			'bucket': str(getattr(settings, 'SUPABASE_STORAGE_BUCKET', '') or '').strip(),
		},
		{
			'label': 'private-media',
			'bucket': str(getattr(settings, 'SUPABASE_PRIVATE_STORAGE_BUCKET', '') or '').strip(),
		},
	)


def build_supabase_client():
	missing_settings = [
		setting_name
		for setting_name, setting_value in (
			('SUPABASE_STORAGE_ENDPOINT', getattr(settings, 'SUPABASE_STORAGE_ENDPOINT', '')),
			('SUPABASE_STORAGE_ACCESS_KEY', getattr(settings, 'SUPABASE_STORAGE_ACCESS_KEY', '')),
			('SUPABASE_STORAGE_SECRET_KEY', getattr(settings, 'SUPABASE_STORAGE_SECRET_KEY', '')),
		)
		if not str(setting_value or '').strip()
	]
	if missing_settings:
		missing_list = ', '.join(missing_settings)
		raise ValueError(f'Supabase storage is missing: {missing_list}')

	try:
		import boto3
	except ImportError as error:
		raise ValueError('The boto3 package is required for Supabase storage backups.') from error

	return boto3.client(
		's3',
		endpoint_url=str(settings.SUPABASE_STORAGE_ENDPOINT).strip(),
		aws_access_key_id=str(settings.SUPABASE_STORAGE_ACCESS_KEY).strip(),
		aws_secret_access_key=str(settings.SUPABASE_STORAGE_SECRET_KEY).strip(),
		region_name=str(getattr(settings, 'SUPABASE_STORAGE_REGION', 'us-east-1') or 'us-east-1').strip(),
	)


def safe_storage_relative_path(key):
	normalized_key = str(key or '').replace('\\', '/')
	posix_path = PurePosixPath(normalized_key)
	if posix_path.is_absolute() or not posix_path.parts or '..' in posix_path.parts:
		raise ValueError(f'Supabase object key cannot be safely stored in a backup: {key!r}')

	return Path(*posix_path.parts)