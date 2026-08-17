from django.core.files.storage import FileSystemStorage, default_storage, storages
from django.core.management.base import BaseCommand, CommandError

from places.services.media_storage import MANAGED_MEDIA_PREFIXES, get_active_managed_storage_names, get_local_managed_storage_names


def _join_storage_path(parent, child):
	return '/'.join(part.strip('/') for part in [parent, child] if str(part or '').strip('/'))


def _iter_storage_files(storage, path):
	try:
		directories, files = storage.listdir(path)
	except FileNotFoundError:
		return

	for file_name in files:
		yield _join_storage_path(path, file_name)

	for directory_name in directories:
		yield from _iter_storage_files(storage, _join_storage_path(path, directory_name))


def get_remote_managed_storage_names(storage):
	managed_names = set()
	for prefix in MANAGED_MEDIA_PREFIXES:
		managed_names.update(_iter_storage_files(storage, prefix.rstrip('/')))
	return managed_names


class Command(BaseCommand):
	help = 'Find and optionally delete orphaned local or Supabase media files for business claims and profile photos.'

	def add_arguments(self, parser):
		parser.add_argument(
			'--delete',
			action='store_true',
			help='Actually delete orphaned files. Without this flag the command only reports them.',
		)
		parser.add_argument(
			'--remote',
			action='store_true',
			help='Inspect configured remote public and private storage. Run this on Render with the production database.',
		)

	def handle(self, *args, **options):
		if options['remote']:
			self._handle_remote(options['delete'])
			return

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

	def _handle_remote(self, delete):
		storage_entries = (
			('public', storages['default']),
			('private', storages['private_media']),
		)
		if any(isinstance(storage, FileSystemStorage) for _, storage in storage_entries):
			raise CommandError('cleanup_orphaned_media --remote requires Supabase storage. Run it on the Render environment.')

		active_names = get_active_managed_storage_names()
		self.stdout.write('cleanup_orphaned_media mode: remote-delete' if delete else 'cleanup_orphaned_media mode: remote-dry-run')
		self.stdout.write(f'Active managed files: {len(active_names)}')
		deleted_count = 0

		for storage_label, storage in storage_entries:
			remote_names = get_remote_managed_storage_names(storage)
			orphaned_names = sorted(remote_names - active_names)
			self.stdout.write(f'{storage_label.title()} remote managed files: {len(remote_names)}')
			self.stdout.write(f'{storage_label.title()} remote orphaned files: {len(orphaned_names)}')
			for orphaned_name in orphaned_names:
				self.stdout.write(f' - {storage_label}/{orphaned_name}')
				if delete:
					storage.delete(orphaned_name)
					deleted_count += 1

		if delete:
			self.stdout.write(self.style.SUCCESS(f'Deleted {deleted_count} orphaned remote file(s).'))
		else:
			self.stdout.write('Dry run only. Re-run with --remote --delete after reviewing the production output.')