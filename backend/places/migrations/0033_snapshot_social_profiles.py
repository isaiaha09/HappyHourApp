from django.db import migrations, models


def _normalize_absolute_url(value):
	raw_value = str(value or '').strip()
	if not raw_value:
		return ''
	if '://' not in raw_value:
		raw_value = f'https://{raw_value.lstrip("/")}'
	return raw_value


def _normalized_hostname(value):
	host = str(value or '').strip().lower()
	if host.startswith('www.'):
		host = host[4:]
	return host


def _infer_social_platform(value):
	raw_value = str(value or '').strip()
	if not raw_value:
		return None
	canonical_url = _normalize_absolute_url(raw_value)
	host = _normalized_hostname(canonical_url.split('://', 1)[-1].split('/', 1)[0])
	if host == 'facebook.com' or host.endswith('.facebook.com') or host == 'fb.com' or host.endswith('.fb.com'):
		return 'facebook'
	if host == 'instagram.com' or host.endswith('.instagram.com'):
		return 'instagram'
	if host == 'tiktok.com' or host.endswith('.tiktok.com'):
		return 'tiktok'
	if host == 'youtube.com' or host.endswith('.youtube.com') or host == 'youtu.be':
		return 'youtube'
	return None


def _extract_username(url, platform):
	segments = [segment for segment in _normalize_absolute_url(url).split('://', 1)[-1].split('/', 1)[-1].split('/') if segment]
	if platform == 'facebook':
		if not segments or segments[0] in {'profile.php', 'groups', 'events', 'watch', 'marketplace', 'gaming'}:
			return ''
		return segments[0]
	if platform == 'instagram':
		return segments[0] if segments else ''
	if platform == 'tiktok':
		return segments[0].lstrip('@') if segments else ''
	if platform == 'youtube':
		if not segments:
			return ''
		if segments[0] in {'channel', 'c', 'user'} and len(segments) > 1:
			return segments[1]
		return segments[0].lstrip('@')
	return ''


def _move_social_urls_to_social_fields(apps, schema_editor):
	for model_name in ('ListingSnapshot', 'DeletedBusiness'):
		Model = apps.get_model('places', model_name)
		for record in Model.objects.all().iterator():
			social_profiles = dict(record.social_profiles or {})
			social_links = list(record.social_media_links or [])
			website_url = str(record.website_url or '').strip()
			source_url = str(record.source_url or '').strip()
			changed = False

			for candidate in (website_url, source_url):
				platform = _infer_social_platform(candidate)
				if not platform:
					continue
				canonical_url = _normalize_absolute_url(candidate)
				username = _extract_username(canonical_url, platform)
				if platform not in social_profiles and username:
					social_profiles[platform] = {
						'url': canonical_url,
						'username': username,
					}
				if canonical_url not in social_links:
					social_links.append(canonical_url)
				changed = True

			if website_url and _infer_social_platform(website_url):
				record.website_url = ''
				changed = True
			if source_url and _infer_social_platform(source_url):
				record.source_url = ''
				changed = True

			if changed:
				record.social_profiles = social_profiles
				record.social_media_links = social_links
				record.save(update_fields=['website_url', 'source_url', 'social_profiles', 'social_media_links'])


class Migration(migrations.Migration):

	dependencies = [
		('places', '0032_listingsnapshot_structured_profile_overrides'),
	]

	operations = [
		migrations.AddField(
			model_name='deletedbusiness',
			name='social_media_links',
			field=models.JSONField(blank=True, default=list),
		),
		migrations.AddField(
			model_name='deletedbusiness',
			name='social_profiles',
			field=models.JSONField(blank=True, default=dict),
		),
		migrations.AddField(
			model_name='listingsnapshot',
			name='social_media_links',
			field=models.JSONField(blank=True, default=list),
		),
		migrations.AddField(
			model_name='listingsnapshot',
			name='social_profiles',
			field=models.JSONField(blank=True, default=dict),
		),
		migrations.RunPython(_move_social_urls_to_social_fields, migrations.RunPython.noop),
	]