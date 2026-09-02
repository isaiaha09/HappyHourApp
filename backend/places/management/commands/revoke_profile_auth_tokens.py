import logging

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError

from places.admin_security import emit_admin_security_event
from places.models import ProfileAuthToken


class Command(BaseCommand):
	help = 'Revoke profile API tokens. Use this after a token or credential-bearing backup may have been exposed.'

	def add_arguments(self, parser):
		parser.add_argument(
			'--all',
			action='store_true',
			help='Revoke every profile API token in the configured database.',
		)
		parser.add_argument(
			'--username',
			default='',
			help='Revoke tokens for one username instead of all users.',
		)
		parser.add_argument(
			'--confirm',
			action='store_true',
			help='Actually delete the selected tokens. Without this flag the command is a dry run.',
		)

	def handle(self, *args, **options):
		username = str(options.get('username') or '').strip()
		if not options.get('all') and not username:
			raise CommandError('Choose --all or --username before revoking tokens.')
		if options.get('all') and username:
			raise CommandError('Use either --all or --username, not both.')

		queryset = ProfileAuthToken.objects.all()
		if username:
			user = get_user_model().objects.filter(username=username).only('pk').first()
			if user is None:
				self.stdout.write(self.style.WARNING(f'No user found for username {username!r}; nothing to revoke.'))
				return
			queryset = queryset.filter(user_id=user.pk)

		count = queryset.count()
		if not options.get('confirm'):
			self.stdout.write(self.style.WARNING(
				f'Dry run: {count} profile API token(s) would be revoked. Re-run with --confirm to apply.'
			))
			return

		deleted_count, _details = queryset.delete()
		emit_admin_security_event(
			None,
			'profile_auth_tokens_revoked',
			log_level=logging.WARNING,
			selector='all' if options.get('all') else 'username',
			username_hash='set' if username else '',
			token_count=deleted_count,
		)
		self.stdout.write(self.style.SUCCESS(f'Revoked {deleted_count} profile API token(s).'))
