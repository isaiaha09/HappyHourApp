from django.conf import settings
from django.http import HttpResponse, HttpResponseRedirect, JsonResponse
from urllib.parse import urlparse


def _configured_ios_app_store_url():
    value = str(getattr(settings, 'PROFILE_IOS_APP_STORE_URL', '') or '').strip()
    parsed = urlparse(value)
    path = parsed.path.lower()
    if (
        parsed.scheme != 'https'
        or parsed.netloc.lower() != 'apps.apple.com'
        or '/app/' not in path
        or not any(part.startswith('id') and part[2:].isdigit() for part in path.split('/'))
    ):
        return ''
    return value


def share_place_redirect(_request, _slug):
    """Send non-installed iOS users to the App Store, never to the public website."""
    app_store_url = _configured_ios_app_store_url()
    if not app_store_url:
        return HttpResponse('DiningDealz profile links are not available yet.', status=404)
    return HttpResponseRedirect(app_store_url)


def apple_app_site_association(_request):
	"""Declare the app-owned share route for iOS Universal Links."""
	app_id = '.'.join([
		str(getattr(settings, 'DININGDEALZ_IOS_TEAM_ID', '') or '').strip(),
		str(getattr(settings, 'DININGDEALZ_IOS_BUNDLE_ID', '') or '').strip(),
	])
	response = JsonResponse({
		'applinks': {
			'details': [{
				'appID': app_id,
				'paths': ['/share/place/*', '/share/places/*'],
			}],
		},
	})
	response['Cache-Control'] = 'public, max-age=300'
	response['X-Content-Type-Options'] = 'nosniff'
	return response
