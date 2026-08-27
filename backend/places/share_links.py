from django.conf import settings
from django.http import HttpResponseRedirect, JsonResponse


def share_place_redirect(_request, _slug):
	"""Send non-installed iOS users to the App Store, never to the public website."""
	return HttpResponseRedirect(settings.PROFILE_IOS_APP_STORE_URL)


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
