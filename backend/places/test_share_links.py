from django.test import TestCase, override_settings


class ShareLinkTests(TestCase):
	@override_settings(
		PROFILE_IOS_APP_STORE_URL='https://apps.apple.com/us/app/diningdealz/id123',
	)
	def test_share_link_redirects_to_the_ios_app_store(self):
		response = self.client.get('/share/place/yard-house/')

		self.assertEqual(response.status_code, 302)
		self.assertEqual(response['Location'], 'https://apps.apple.com/us/app/diningdealz/id123')

	@override_settings(
		DININGDEALZ_IOS_TEAM_ID='TEAM123',
		DININGDEALZ_IOS_BUNDLE_ID='com.example.diningdealz',
	)
	def test_aasa_declares_the_profile_share_paths(self):
		response = self.client.get('/.well-known/apple-app-site-association')

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.json()['applinks']['details'][0], {
			'appID': 'TEAM123.com.example.diningdealz',
			'paths': ['/share/place/*', '/share/places/*'],
		})
