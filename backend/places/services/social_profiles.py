from urllib.parse import parse_qs, urlparse


SOCIAL_PROFILE_PLATFORMS = ('instagram', 'facebook', 'tiktok', 'youtube', 'website')

SOCIAL_PROFILE_DOMAINS = {
	'instagram': ('instagram.com',),
	'facebook': ('facebook.com', 'fb.com'),
	'tiktok': ('tiktok.com',),
	'youtube': ('youtube.com', 'youtu.be'),
	'website': (),
}


def empty_social_profiles():
	return {}


def normalize_social_profiles(value=None, fallback_website_url='', fallback_social_links=None):
	normalized_profiles = {}
	source_value = value if isinstance(value, dict) else {}

	for platform in SOCIAL_PROFILE_PLATFORMS:
		platform_value = source_value.get(platform)
		if isinstance(platform_value, dict):
			raw_value = str(platform_value.get('url') or platform_value.get('username') or '').strip()
		else:
			raw_value = str(platform_value or '').strip()

		if platform == 'website' and not raw_value:
			raw_value = str(fallback_website_url or '').strip()

		if not raw_value:
			continue

		profile = normalize_social_profile(platform, raw_value)
		if profile:
			normalized_profiles[platform] = profile

	for raw_link in list(fallback_social_links or []):
		candidate_link = str(raw_link or '').strip()
		if not candidate_link:
			continue
		platform = infer_social_platform(candidate_link)
		if platform is None or platform in normalized_profiles:
			continue
		profile = normalize_social_profile(platform, candidate_link)
		if profile:
			normalized_profiles[platform] = profile

	return normalized_profiles


def normalize_social_profile(platform, value):
	platform_key = str(platform or '').strip().lower()
	if platform_key not in SOCIAL_PROFILE_PLATFORMS:
		raise ValueError('Unsupported social platform.')

	raw_value = str(value or '').strip()
	if not raw_value:
		return None

	if platform_key == 'website':
		canonical_url = _normalize_absolute_url(raw_value)
		parsed = urlparse(canonical_url)
		host = _normalized_hostname(parsed.netloc)
		if not host:
			raise ValueError('Enter a valid website URL.')
		return {
			'url': canonical_url,
			'username': host,
		}

	if _looks_like_url(raw_value):
		canonical_url = _normalize_absolute_url(raw_value)
		parsed = urlparse(canonical_url)
		host = _normalized_hostname(parsed.netloc)
		if not _hostname_matches_platform(platform_key, host):
			raise ValueError(_invalid_social_profile_message(platform_key))
		username = _extract_platform_username_from_url(platform_key, parsed)
		if not username:
			raise ValueError(_invalid_social_profile_message(platform_key))
		return {
			'url': _build_platform_url(platform_key, username, canonical_url),
			'username': username,
		}

	username = _normalize_platform_username(platform_key, raw_value)
	if not username:
		raise ValueError(_invalid_social_profile_message(platform_key))
	return {
		'url': _build_platform_url(platform_key, username),
		'username': username,
	}


def build_social_media_links(profiles):
	return [
		profile['url']
		for platform, profile in normalize_social_profiles(profiles).items()
		if platform != 'website' and str(profile.get('url') or '').strip()
	]


def get_business_website_url(profiles, fallback=''):
	normalized_profiles = normalize_social_profiles(profiles, fallback_website_url=fallback)
	website_profile = normalized_profiles.get('website') or {}
	return str(website_profile.get('url') or '').strip()


def normalize_business_contact_channels(website_url='', source_url='', social_profiles=None, social_media_links=None):
	raw_website_url = str(website_url or '').strip()
	raw_source_url = str(source_url or '').strip()
	fallback_social_links = list(social_media_links or [])

	if raw_website_url and infer_social_platform(raw_website_url):
		fallback_social_links.append(raw_website_url)
		raw_website_url = ''

	if raw_source_url and infer_social_platform(raw_source_url):
		fallback_social_links.append(raw_source_url)
		raw_source_url = ''

	normalized_social_profiles = normalize_social_profiles(
		social_profiles,
		fallback_website_url=raw_website_url,
		fallback_social_links=fallback_social_links,
	)
	return {
		'social_profiles': normalized_social_profiles,
		'social_media_links': build_social_media_links(normalized_social_profiles),
		'website_url': get_business_website_url(normalized_social_profiles, fallback=raw_website_url),
		'source_url': _normalize_absolute_url(raw_source_url) if raw_source_url else '',
	}


def infer_social_platform(value):
	if not _looks_like_url(value):
		return None
	parsed = urlparse(_normalize_absolute_url(value))
	host = _normalized_hostname(parsed.netloc)
	for platform, domains in SOCIAL_PROFILE_DOMAINS.items():
		if platform == 'website':
			continue
		if _hostname_matches_platform(platform, host):
			return platform
	return None


def _invalid_social_profile_message(platform):
	platform_label = platform.capitalize() if platform != 'youtube' else 'YouTube'
	return f'Enter a valid {platform_label} profile URL or username.'


def _looks_like_url(value):
	raw_value = str(value or '').strip()
	return raw_value.startswith(('http://', 'https://')) or '.' in raw_value or '/' in raw_value


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


def _hostname_matches_platform(platform, host):
	if not host:
		return False
	return any(host == domain or host.endswith(f'.{domain}') for domain in SOCIAL_PROFILE_DOMAINS[platform])


def _extract_platform_username_from_url(platform, parsed):
	segments = [segment for segment in parsed.path.split('/') if segment]
	query = parse_qs(parsed.query)

	if platform == 'instagram':
		if not segments or segments[0] in {'p', 'reel', 'reels', 'stories', 'explore'}:
			return ''
		return _normalize_platform_username(platform, segments[0])

	if platform == 'facebook':
		if not segments:
			return _normalize_platform_username(platform, query.get('id', [''])[0])
		if segments[0] == 'profile.php':
			return _normalize_platform_username(platform, query.get('id', [''])[0])
		if segments[0] == 'people':
			if len(segments) < 2:
				return ''
			return _normalize_platform_username(platform, '/'.join(segments[:3]))
		if segments[0] in {'groups', 'events', 'watch', 'marketplace', 'gaming'}:
			return ''
		return _normalize_platform_username(platform, segments[0])

	if platform == 'tiktok':
		if not segments or segments[0] in {'discover', 'tag', 'music'}:
			return ''
		return _normalize_platform_username(platform, segments[0])

	if platform == 'youtube':
		if _normalized_hostname(parsed.netloc) == 'youtu.be':
			return ''
		if not segments:
			return ''
		if segments[0].startswith('@'):
			return _normalize_platform_username(platform, segments[0])
		if segments[0] in {'channel', 'c', 'user'} and len(segments) > 1:
			return _normalize_platform_username(platform, segments[1])
		if segments[0] in {'watch', 'shorts', 'playlist'}:
			return ''
		return _normalize_platform_username(platform, segments[0])

	return ''


def _normalize_platform_username(platform, value):
	username = str(value or '').strip()
	if not username:
		return ''
	if platform in {'instagram', 'tiktok', 'youtube'} and username.startswith('@'):
		username = username[1:]
	username = username.strip().strip('/')
	if not username:
		return ''
	return username


def _build_platform_url(platform, username, fallback_url=''):
	if platform == 'website':
		return _normalize_absolute_url(fallback_url or username)
	if platform == 'instagram':
		return f'https://instagram.com/{username}'
	if platform == 'facebook':
		return f'https://facebook.com/{username}'
	if platform == 'tiktok':
		return f'https://tiktok.com/@{username.lstrip("@")}'
	if platform == 'youtube':
		if username.startswith('@'):
			return f'https://youtube.com/{username}'
		return f'https://youtube.com/@{username}'
	return _normalize_absolute_url(fallback_url or username)