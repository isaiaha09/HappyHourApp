from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

class Command(BaseCommand):
	help = 'Validate production-facing admin security settings without printing secrets.'

	def add_arguments(self, parser):
		parser.add_argument(
			'--production',
			action='store_true',
			help='Apply the production gate even when the current settings do not identify as production.',
		)

	def handle(self, *args, **options):
		production = bool(options.get('production') or getattr(settings, 'IS_PRODUCTION', False))
		if not production:
			self.stdout.write(self.style.WARNING('Current settings are not marked as production; no production gate was applied.'))
			return

		failures = []
		warnings = []
		checks = (
			('DEBUG', not settings.DEBUG, 'DEBUG must be false.'),
			('SECRET_KEY', settings.SECRET_KEY != getattr(settings, 'DEFAULT_SECRET_KEY', ''), 'DJANGO_SECRET_KEY must be set to a unique value.'),
			('ALLOWED_HOSTS', '*' not in settings.ALLOWED_HOSTS, 'ALLOWED_HOSTS must not contain *.'),
			('SECURE_SSL_REDIRECT', bool(settings.SECURE_SSL_REDIRECT), 'HTTPS redirect must be enabled.'),
			('SESSION_COOKIE_SECURE', bool(settings.SESSION_COOKIE_SECURE), 'Admin session cookies must be Secure.'),
			('CSRF_COOKIE_SECURE', bool(settings.CSRF_COOKIE_SECURE), 'CSRF cookies must be Secure.'),
			('ADMIN_SESSION_AGE_SECONDS', int(getattr(settings, 'ADMIN_SESSION_AGE_SECONDS', 0) or 0) <= 8 * 60 * 60, 'Admin sessions should expire within eight hours.'),
			('ADMIN_SESSION_IDLE_TIMEOUT_SECONDS', int(getattr(settings, 'ADMIN_SESSION_IDLE_TIMEOUT_SECONDS', 0) or 0) < int(getattr(settings, 'ADMIN_SESSION_AGE_SECONDS', 0) or 0), 'Admin idle timeout must be shorter than the absolute session age.'),
		)
		for name, passed, message in checks:
			if not passed:
				failures.append(f'{name}: {message}')

		if not getattr(settings, 'ADMIN_IP_ALLOWLIST', ()):
			warnings.append('ADMIN_IP_ALLOWLIST is empty; enforce the admin network boundary at the Render/edge layer.')
		if not getattr(settings, 'REDIS_URL', ''):
			warnings.append('REDIS_URL is empty; admin login rate limiting is process-local and will not coordinate across workers.')
		if not getattr(settings, 'CSRF_TRUSTED_ORIGINS', ()):
			warnings.append('CSRF_TRUSTED_ORIGINS is empty; set the final HTTPS admin origin explicitly.')

		user_model = get_user_model()
		unenrolled_superusers = user_model.objects.filter(
			is_active=True,
			is_superuser=True,
		).exclude(
			account_profile__admin_two_factor_enabled=True,
		).count()
		if unenrolled_superusers:
			warnings.append(f'{unenrolled_superusers} active superuser account(s) do not have admin 2FA enabled.')

		for warning in warnings:
			self.stdout.write(self.style.WARNING(f'WARNING: {warning}'))
		if failures:
			for failure in failures:
				self.stdout.write(self.style.ERROR(f'FAIL: {failure}'))
			raise CommandError(f'Admin security check failed with {len(failures)} error(s).')

		self.stdout.write(self.style.SUCCESS('Admin security production checks passed.'))
