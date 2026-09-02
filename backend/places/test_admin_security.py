import json
import time
from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import pyotp
from django.contrib.admin.sites import AdminSite
from django.contrib.auth.models import Group, User
from django.core.cache import cache
from django.core.management import call_command
from django.test import Client, RequestFactory, TestCase, override_settings
from django.urls import reverse

from .admin import (
	DeletedBusinessAdmin,
	ListingSnapshotAdmin,
	ReadOnlyAnalyticsAdmin,
	StaffGroupAdmin,
	StaffUserAdmin,
)
from .admin_security import ADMIN_LAST_ACTIVITY_SESSION_KEY, ADMIN_MFA_VERIFIED_SESSION_KEY
from .models import AccountProfile, DeletedBusiness, FeedImpression, ListingSnapshot, ProfileAuthToken


class AdminWriteProtectionTests(TestCase):
	def setUp(self):
		self.admin_user = User.objects.create_superuser(
			username='admin-security-owner',
			email='admin-security-owner@example.com',
			password='test-pass-123',
		)
		self.client = Client(enforce_csrf_checks=True)
		self.client.force_login(self.admin_user)

	def _csrf_token(self, response):
		cookie = response.cookies.get('csrftoken')
		self.assertIsNotNone(cookie)
		return cookie.value

	def test_listing_pull_get_only_renders_confirmation_without_mutating(self):
		snapshot = ListingSnapshot.objects.create(
			name='Confirmation Bistro',
			listing_slug='confirmation-bistro',
			source_name='verified_businesses',
		)
		response = self.client.get(reverse('happyhour_admin:places_listingsnapshot_pull_one', args=[snapshot.pk]))

		self.assertEqual(response.status_code, 200)
		self.assertTemplateUsed(response, 'admin/places/listingsnapshot/pull_confirmation.html')
		self.assertContains(response, 'Pull business data?')
		self.assertFalse(response.context['snapshot'].updated_at is None)
		self.assertTrue(ListingSnapshot.objects.filter(pk=snapshot.pk).exists())

	def test_listing_pull_requires_csrf_protected_post(self):
		snapshot = ListingSnapshot.objects.create(
			name='CSRF Bistro',
			listing_slug='csrf-bistro',
			source_name='verified_businesses',
		)
		pull_url = reverse('happyhour_admin:places_listingsnapshot_pull_one', args=[snapshot.pk])

		self.client.get(pull_url)
		response = self.client.post(pull_url)

		self.assertEqual(response.status_code, 403)
		self.assertTrue(ListingSnapshot.objects.filter(pk=snapshot.pk).exists())

	def test_deleted_business_restore_get_only_renders_confirmation(self):
		deleted_business = DeletedBusiness.objects.create(
			name='Restore Bistro',
			listing_slug='restore-bistro',
		)
		restore_url = reverse('happyhour_admin:places_deletedbusiness_restore_one', args=[deleted_business.pk])

		response = self.client.get(restore_url)

		self.assertEqual(response.status_code, 200)
		self.assertTemplateUsed(response, 'admin/places/deletedbusiness/restore_confirmation.html')
		self.assertContains(response, 'Restore business?')
		self.assertTrue(DeletedBusiness.objects.filter(pk=deleted_business.pk).exists())

	def test_deleted_business_restore_requires_csrf_protected_post(self):
		deleted_business = DeletedBusiness.objects.create(
			name='Restore CSRF Bistro',
			listing_slug='restore-csrf-bistro',
		)
		restore_url = reverse('happyhour_admin:places_deletedbusiness_restore_one', args=[deleted_business.pk])

		self.client.get(restore_url)
		response = self.client.post(restore_url)

		self.assertEqual(response.status_code, 403)
		self.assertTrue(DeletedBusiness.objects.filter(pk=deleted_business.pk).exists())


class AdminAuthenticationSecurityTests(TestCase):
	def setUp(self):
		cache.clear()

	def tearDown(self):
		cache.clear()

	def _login(self, client, username, password):
		login_url = reverse('happyhour_admin:login')
		get_response = client.get(login_url)
		payload = {
			'username': username,
			'password': password,
			'next': reverse('happyhour_admin:index'),
			'csrfmiddlewaretoken': get_response.cookies['csrftoken'].value,
		}
		return client.post(login_url, payload)

	def test_admin_password_login_redirects_to_separate_mfa_screen(self):
		user = User.objects.create_user(
			username='mfa-admin',
			email='mfa-admin@example.com',
			password='safe-admin-pass-123',
			is_staff=True,
		)
		secret = pyotp.random_base32()
		AccountProfile.objects.create(user=user, admin_two_factor_enabled=True, admin_two_factor_secret=secret)
		client = Client(enforce_csrf_checks=True)

		with override_settings(ADMIN_LOGIN_MAX_ATTEMPTS=20):
			password_response = self._login(client, user.username, 'safe-admin-pass-123')
			self.assertEqual(password_response.status_code, 302)
			self.assertTrue(client.session.get('_auth_user_id'))

			mfa_redirect = client.get(reverse('happyhour_admin:index'))
			self.assertEqual(mfa_redirect.status_code, 302)
			self.assertIn(reverse('happyhour_admin:mfa'), mfa_redirect['Location'])

			mfa_page = client.get(reverse('happyhour_admin:mfa'))
			self.assertEqual(mfa_page.status_code, 200)
			self.assertTemplateUsed(mfa_page, 'admin/mfa.html')
			self.assertContains(mfa_page, 'Additional verification required')

			invalid_response = client.post(
				reverse('happyhour_admin:mfa'),
				{
					'otp_code': '000000',
					'next': reverse('happyhour_admin:index'),
					'csrfmiddlewaretoken': client.cookies['csrftoken'].value,
				},
			)
			self.assertEqual(invalid_response.status_code, 200)
			self.assertContains(invalid_response, 'invalid or expired')

			valid_response = client.post(
				reverse('happyhour_admin:mfa'),
				{
					'otp_code': pyotp.TOTP(secret).now(),
					'next': reverse('happyhour_admin:index'),
					'csrfmiddlewaretoken': client.cookies['csrftoken'].value,
				},
			)
			self.assertEqual(valid_response.status_code, 302)
			self.assertEqual(valid_response['Location'], reverse('happyhour_admin:index'))
			self.assertTrue(client.get(reverse('happyhour_admin:index')).status_code == 200)

	def test_admin_login_uses_unfold_screen_without_inline_mfa_field(self):
		response = Client().get(reverse('happyhour_admin:login'))

		self.assertEqual(response.status_code, 200)
		self.assertNotContains(response, 'Authenticator code')
		self.assertContains(response, 'Welcome back to')

	def test_admin_without_two_factor_can_continue_after_password_login(self):
		user = User.objects.create_user(
			username='password-only-admin',
			password='safe-admin-pass-123',
			is_staff=True,
		)
		client = Client(enforce_csrf_checks=True)

		password_response = self._login(client, user.username, 'safe-admin-pass-123')
		self.assertEqual(password_response.status_code, 302)
		self.assertEqual(password_response['Location'], reverse('happyhour_admin:index'))
		self.assertEqual(client.get(reverse('happyhour_admin:index')).status_code, 200)

	def test_customer_two_factor_does_not_enable_admin_two_factor(self):
		user = User.objects.create_user(
			username='customer-mfa-only-admin',
			password='safe-admin-pass-123',
			is_staff=True,
		)
		AccountProfile.objects.create(user=user, two_factor_enabled=True, two_factor_secret=pyotp.random_base32())
		client = Client(enforce_csrf_checks=True)

		password_response = self._login(client, user.username, 'safe-admin-pass-123')

		self.assertEqual(password_response.status_code, 302)
		self.assertEqual(password_response['Location'], reverse('happyhour_admin:index'))
		self.assertEqual(client.get(reverse('happyhour_admin:index')).status_code, 200)

	def test_admin_login_rate_limit_blocks_repeated_failures(self):
		user = User.objects.create_user(
			username='rate-limited-admin',
			password='safe-admin-pass-123',
			is_staff=True,
		)
		client = Client(enforce_csrf_checks=True)

		with override_settings(ADMIN_LOGIN_MAX_ATTEMPTS=2, ADMIN_LOGIN_WINDOW_SECONDS=60):
			first_response = self._login(client, user.username, 'wrong-pass-1')
			second_response = self._login(client, user.username, 'wrong-pass-2')
			limited_response = self._login(client, user.username, 'safe-admin-pass-123')

		self.assertEqual(first_response.status_code, 200)
		self.assertEqual(second_response.status_code, 200)
		self.assertEqual(limited_response.status_code, 200)
		self.assertContains(limited_response, 'Too many failed admin sign-in attempts')
		self.assertNotIn('_auth_user_id', client.session)

	def test_admin_session_idle_timeout_logs_user_out(self):
		user = User.objects.create_superuser(
			username='idle-admin',
			email='idle-admin@example.com',
			password='safe-admin-pass-123',
		)
		client = Client()
		client.force_login(user)
		session = client.session
		session[ADMIN_LAST_ACTIVITY_SESSION_KEY] = time.time() - 61
		session.save()

		with override_settings(ADMIN_SESSION_IDLE_TIMEOUT_SECONDS=60):
			response = client.get(reverse('happyhour_admin:index'))

		self.assertEqual(response.status_code, 302)
		self.assertIn(reverse('happyhour_admin:login'), response['Location'])
		self.assertNotIn('_auth_user_id', client.session)

	def test_existing_admin_session_cannot_bypass_newly_required_mfa(self):
		user = User.objects.create_superuser(
			username='existing-session-admin',
			email='existing-session-admin@example.com',
			password='safe-admin-pass-123',
		)
		secret = pyotp.random_base32()
		AccountProfile.objects.create(user=user, admin_two_factor_enabled=True, admin_two_factor_secret=secret)
		client = Client()
		client.force_login(user)

		response = client.get(reverse('happyhour_admin:index'))

		self.assertEqual(response.status_code, 302)
		self.assertIn(reverse('happyhour_admin:mfa'), response['Location'])
		self.assertTrue(client.session.get('_auth_user_id'))
		self.assertNotIn(ADMIN_MFA_VERIFIED_SESSION_KEY, client.session)

	def test_admin_ip_allowlist_denies_untrusted_network(self):
		with override_settings(ADMIN_IP_ALLOWLIST=['10.0.0.0/8']):
			response = Client().get(reverse('happyhour_admin:login'))

		self.assertEqual(response.status_code, 403)

	def test_admin_security_page_enrolls_two_factor_for_current_account(self):
		user = User.objects.create_superuser(
			username='self-service-mfa-admin',
			email='self-service-mfa-admin@example.com',
			password='safe-admin-pass-123',
		)
		client = Client(enforce_csrf_checks=True)
		client.force_login(user)

		security_url = reverse('happyhour_admin:security')
		page = client.get(security_url)
		self.assertEqual(page.status_code, 200)
		self.assertContains(page, 'Two-factor authentication is not enabled.')

		begin_response = client.post(
			security_url,
			{
				'action': 'begin',
				'csrfmiddlewaretoken': client.cookies['csrftoken'].value,
			},
		)
		self.assertEqual(begin_response.status_code, 200)
		self.assertContains(begin_response, 'Scan this QR code with your authenticator app')
		self.assertContains(begin_response, 'Admin authenticator enrollment QR code')
		self.assertContains(begin_response, 'data:image/png;base64,')
		self.assertNotContains(begin_response, 'manual entry key')
		self.assertNotContains(begin_response, 'Authenticator URI')
		profile = AccountProfile.objects.get(user=user)
		self.assertTrue(profile.admin_two_factor_pending_secret)
		self.assertNotContains(begin_response, profile.admin_two_factor_pending_secret)
		self.assertNotContains(begin_response, profile.get_admin_two_factor_provisioning_uri(use_pending=True))

		confirm_response = client.post(
			security_url,
			{
				'action': 'confirm',
				'otp_code': pyotp.TOTP(profile.admin_two_factor_pending_secret).now(),
				'csrfmiddlewaretoken': client.cookies['csrftoken'].value,
			},
		)
		self.assertEqual(confirm_response.status_code, 200)
		profile.refresh_from_db()
		self.assertTrue(profile.admin_two_factor_enabled)
		self.assertTrue(client.session.get(ADMIN_MFA_VERIFIED_SESSION_KEY))

		rotate_response = client.post(
			security_url,
			{
				'action': 'rotate',
				'csrfmiddlewaretoken': client.cookies['csrftoken'].value,
			},
		)
		self.assertEqual(rotate_response.status_code, 200)
		self.assertContains(rotate_response, 'Scan this QR code with your replacement authenticator app')
		self.assertContains(rotate_response, 'Admin authenticator enrollment QR code')
		self.assertContains(rotate_response, 'data:image/png;base64,')
		self.assertNotContains(rotate_response, 'manual entry key')
		self.assertNotContains(rotate_response, 'Authenticator URI')
		self.assertContains(rotate_response, 'Replacement enrollment started')
		self.assertContains(rotate_response, 'Confirm replacement authenticator')
		profile.refresh_from_db()
		self.assertTrue(profile.admin_two_factor_pending_secret)
		self.assertNotContains(rotate_response, profile.admin_two_factor_pending_secret)
		self.assertNotContains(rotate_response, profile.get_admin_two_factor_provisioning_uri(use_pending=True))


class AdminRoleBoundaryTests(TestCase):
	def setUp(self):
		self.site = AdminSite()
		self.request_factory = RequestFactory()
		self.operator = User.objects.create_user(username='operations-staff', password='safe-pass-123', is_staff=True)
		self.superuser = User.objects.create_superuser(username='role-owner', password='safe-pass-123')
		self.staff_target = User.objects.create_user(username='another-staff', password='safe-pass-123', is_staff=True)

	def _request(self, user):
		request = self.request_factory.get('/admin/auth/user/')
		request.user = user
		return request

	def test_non_superuser_cannot_manage_staff_or_groups(self):
		user_admin = StaffUserAdmin(User, self.site)
		group_admin = StaffGroupAdmin(Group, self.site)
		request = self._request(self.operator)

		self.assertFalse(user_admin.has_add_permission(request))
		self.assertFalse(user_admin.has_change_permission(request, self.staff_target))
		self.assertFalse(user_admin.has_delete_permission(request, self.staff_target))
		self.assertFalse(group_admin.has_view_permission(request))
		self.assertFalse(group_admin.has_add_permission(request))
		self.assertFalse(group_admin.has_change_permission(request))
		self.assertFalse(group_admin.has_delete_permission(request))
		self.assertNotIn(self.superuser.pk, user_admin.get_queryset(request).values_list('pk', flat=True))

	def test_superuser_retains_staff_and_group_management(self):
		user_admin = StaffUserAdmin(User, self.site)
		group_admin = StaffGroupAdmin(Group, self.site)
		request = self._request(self.superuser)

		self.assertTrue(user_admin.has_change_permission(request, self.staff_target))
		self.assertTrue(group_admin.has_change_permission(request))
		field_names = {
			field
			for _title, options in user_admin.get_fieldsets(request, self.staff_target)
			for field in options.get('fields', ())
		}
		self.assertIn('is_superuser', field_names)

	def test_analytics_admin_is_not_deletable(self):
		analytics_admin = ReadOnlyAnalyticsAdmin(FeedImpression, self.site)
		self.assertFalse(analytics_admin.has_delete_permission(self._request(self.superuser)))


class BackupAndTokenSecurityTests(TestCase):
	def test_backup_fixture_excludes_and_redacts_authentication_material(self):
		user = User.objects.create_user(username='backup-security-user', password='real-password-123')
		profile = AccountProfile.objects.create(
			user=user,
			email_verification_token='email-token',
			email_verification_code='123456',
			two_factor_secret=pyotp.random_base32(),
			two_factor_pending_secret=pyotp.random_base32(),
			admin_two_factor_secret=pyotp.random_base32(),
			admin_two_factor_pending_secret=pyotp.random_base32(),
			password_reset_token='password-reset-token',
		)
		ProfileAuthToken.objects.create(user=user)

		with TemporaryDirectory() as temp_dir:
			output_dir = Path(temp_dir) / 'backups'
			with patch('places.management.commands.backup_admin_data.Command._backup_sqlite_database', return_value=''):
				call_command('backup_admin_data', '--output-dir', str(output_dir), '--label', 'security-test', stdout=StringIO())

			backup_dir = next(output_dir.iterdir())
			fixture = json.loads((backup_dir / 'database-fixture.json').read_text(encoding='utf-8'))
			models = [record['model'] for record in fixture]
			self.assertNotIn('places.profileauthtoken', models)
			user_record = next(record for record in fixture if record['model'] == 'auth.user' and record['pk'] == user.pk)
			self.assertEqual(user_record['fields']['password'], '!backup-redacted!')
			profile_record = next(record for record in fixture if record['model'] == 'places.accountprofile' and record['pk'] == profile.pk)
			self.assertEqual(profile_record['fields']['email_verification_token'], '')
			self.assertEqual(profile_record['fields']['two_factor_secret'], '')
			self.assertEqual(profile_record['fields']['admin_two_factor_secret'], '')
			self.assertEqual(profile_record['fields']['admin_two_factor_pending_secret'], '')
			manifest = json.loads((backup_dir / 'manifest.json').read_text(encoding='utf-8'))
			self.assertIn('places.profileauthtoken', manifest['database_fixture_security']['excluded_models'])

	def test_profile_token_revocation_command_is_dry_run_without_confirm(self):
		user = User.objects.create_user(username='revoke-user', password='safe-pass-123')
		ProfileAuthToken.objects.create(user=user)
		ProfileAuthToken.objects.create(user=user)

		call_command('revoke_profile_auth_tokens', '--all', stdout=StringIO())
		self.assertEqual(ProfileAuthToken.objects.filter(user=user).count(), 2)

		call_command('revoke_profile_auth_tokens', '--all', '--confirm', stdout=StringIO())
		self.assertEqual(ProfileAuthToken.objects.filter(user=user).count(), 0)
