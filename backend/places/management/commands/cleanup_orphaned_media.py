from django.core.files.storage import default_storage
from django.core.management.base import BaseCommand, CommandError

from places.services.media_storage import get_active_managed_storage_names, get_local_managed_storage_names


class Command(BaseCommand):
	help = 'Find and optionally delete orphaned local media files for business claims and profile photos.'

	def add_arguments(self, parser):
		parser.add_argument(
			'--delete',
			action='store_true',
			help='Actually delete orphaned files. Without this flag the command only reports them.',
		)

	def handle(self, *args, **options):
		if not hasattr(default_storage, 'path'):
			raise CommandError('cleanup_orphaned_media only supports local filesystem storage.')

		active_names = get_active_managed_storage_names()
		local_names = get_local_managed_storage_names()
		orphaned_names = sorted(local_names - active_names)

		mode_label = 'delete' if options['delete'] else 'dry-run'
		self.stdout.write(f'cleanup_orphaned_media mode: {mode_label}')
		self.stdout.write(f'Active managed files: {len(active_names)}')
		self.stdout.write(f'Local managed files: {len(local_names)}')
		self.stdout.write(f'Orphaned managed files: {len(orphaned_names)}')

		for orphaned_name in orphaned_names:
			self.stdout.write(f' - {orphaned_name}')
			if options['delete']:
				default_storage.delete(orphaned_name)

		if options['delete']:
			self.stdout.write(self.style.SUCCESS(f'Deleted {len(orphaned_names)} orphaned file(s).'))
		else:
			self.stdout.write('Dry run only. Re-run with --delete to remove these files.')