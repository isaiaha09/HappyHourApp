import hashlib
import json
import shutil
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from places.services.discovery_exclusions import get_discovery_exclusions_path
from places.services.importers.discovered_json_places import get_discovery_json_path, get_discovery_json_seed_path
from places.services.production_backup import build_supabase_client, get_supabase_bucket_configs, safe_storage_relative_path


class Command(BaseCommand):
	help = 'Restore Supabase media and discovery files from a backup bundle. PostgreSQL is restored separately with pg_restore.'

	def add_arguments(self, parser):
		parser.add_argument(
			'--backup-dir',
			required=True,
			help='Path to a completed production backup bundle containing manifest.json.',
		)
		parser.add_argument(
			'--apply',
			action='store_true',
			help='Actually upload/copy files. Without this flag the command only verifies and previews the restore.',
		)
		parser.add_argument(
			'--skip-media',
			action='store_true',
			help='Skip Supabase media restore.',
		)
		parser.add_argument(
			'--skip-discovery',
			action='store_true',
			help='Skip file-based discovery restore.',
		)

	def handle(self, *args, **options):
		if options['skip_media'] and options['skip_discovery']:
			raise CommandError('Remove one of --skip-media or --skip-discovery; both cannot be skipped.')

		backup_dir = Path(options['backup_dir']).expanduser().resolve()
		manifest = self._load_manifest(backup_dir)
		apply_changes = bool(options['apply'])
		mode_label = 'apply' if apply_changes else 'dry-run'
		self.stdout.write(f'Restore mode: {mode_label}')

		if not options['skip_media']:
			media_count = self._restore_media(backup_dir, manifest, apply_changes)
			self.stdout.write(f'Supabase media objects checked: {media_count}')

		if not options['skip_discovery']:
			discovery_count = self._restore_discovery(backup_dir, manifest, apply_changes)
			self.stdout.write(f'Discovery files checked: {discovery_count}')

		if apply_changes:
			self.stdout.write(self.style.SUCCESS('Production data restore completed.'))
		else:
			self.stdout.write('Dry run only. Re-run with --apply to make these changes.')

	def _load_manifest(self, backup_dir):
		manifest_path = backup_dir / 'manifest.json'
		if not manifest_path.exists():
			raise CommandError(f'Backup manifest was not found: {manifest_path}')

		try:
			manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
		except (OSError, json.JSONDecodeError) as error:
			raise CommandError(f'Could not read backup manifest: {manifest_path}') from error
		if not isinstance(manifest, dict) or manifest.get('status') != 'complete':
			raise CommandError('The backup manifest is not marked complete.')
		if manifest.get('backup_format_version') != 1:
			raise CommandError('The backup manifest format is not supported by this restore command.')
		return manifest

	def _restore_media(self, backup_dir, manifest, apply_changes):
		bucket_manifests = manifest.get('storage_buckets') or []
		if not isinstance(bucket_manifests, list):
			raise CommandError('The backup manifest has an invalid storage_buckets section.')
		if not bucket_manifests:
			return 0

		try:
			client = build_supabase_client()
			bucket_configs = get_supabase_bucket_configs()
		except ValueError as error:
			raise CommandError(str(error)) from error
		targets = {config['label']: config for config in bucket_configs if config['bucket']}
		checked_count = 0

		for bucket_manifest in bucket_manifests:
			label = str(bucket_manifest.get('label') or '')
			target = targets.get(label)
			if target is None:
				raise CommandError(f'No configured Supabase target bucket is available for {label!r}.')
			for object_manifest in bucket_manifest.get('objects') or []:
				source_path = self._archive_file(backup_dir, object_manifest.get('file'))
				self._verify_archive_file(source_path, object_manifest)
				key = str(object_manifest.get('key') or '')
				try:
					safe_storage_relative_path(key)
				except ValueError as error:
					raise CommandError(str(error)) from error
				self.stdout.write(f" - {label}/{key}")
				if apply_changes:
					extra = self._build_upload_metadata(object_manifest)
					upload_options = {'ExtraArgs': extra} if extra else {}
					client.upload_file(str(source_path), target['bucket'], key, **upload_options)
				checked_count += 1
		return checked_count

	def _restore_discovery(self, backup_dir, manifest, apply_changes):
		discovery_manifests = manifest.get('discovery_files') or []
		if not isinstance(discovery_manifests, list):
			raise CommandError('The backup manifest has an invalid discovery_files section.')
		targets = {
			'runtime_discovered_places': Path(get_discovery_json_path()),
			'seed_discovered_places': Path(get_discovery_json_seed_path()),
			'discovery_exclusions': Path(get_discovery_exclusions_path()),
		}
		checked_count = 0
		seen_targets = set()

		for file_manifest in discovery_manifests:
			if not file_manifest.get('present'):
				continue
			role = str(file_manifest.get('role') or '')
			if role not in targets:
				raise CommandError(f'Unknown discovery file role in backup manifest: {role!r}.')
			source_path = self._archive_file(backup_dir, file_manifest.get('file'))
			self._verify_archive_file(source_path, file_manifest)
			target_path = targets[role]
			if target_path.resolve() in seen_targets:
				continue
			seen_targets.add(target_path.resolve())
			self.stdout.write(f' - {role}: {target_path}')
			if apply_changes:
				target_path.parent.mkdir(parents=True, exist_ok=True)
				shutil.copy2(source_path, target_path)
			checked_count += 1
		return checked_count

	def _build_upload_metadata(self, object_manifest):
		metadata = {}
		for manifest_key, upload_key in (
			('content_type', 'ContentType'),
			('cache_control', 'CacheControl'),
			('content_disposition', 'ContentDisposition'),
			('content_encoding', 'ContentEncoding'),
			('content_language', 'ContentLanguage'),
		):
			value = str(object_manifest.get(manifest_key) or '').strip()
			if value:
				metadata[upload_key] = value
		object_metadata = object_manifest.get('metadata') or {}
		if object_metadata:
			metadata['Metadata'] = {str(key): str(value) for key, value in object_metadata.items()}
		return metadata

	def _archive_file(self, backup_dir, relative_name):
		if not relative_name:
			raise CommandError('The backup manifest contains an empty archive file path.')
		relative_path = Path(str(relative_name))
		if relative_path.is_absolute() or '..' in relative_path.parts:
			raise CommandError(f'Archive file path is not safe: {relative_name!r}')
		archive_path = (backup_dir / relative_path).resolve()
		try:
			archive_path.relative_to(backup_dir)
		except ValueError as error:
			raise CommandError(f'Archive file path escapes the backup directory: {relative_name!r}') from error
		if not archive_path.exists() or not archive_path.is_file():
			raise CommandError(f'Archive file was not found: {archive_path}')
		return archive_path

	def _verify_archive_file(self, archive_path, file_manifest):
		expected_size = file_manifest.get('size')
		if expected_size is not None and archive_path.stat().st_size != int(expected_size):
			raise CommandError(f'Archive file size does not match its manifest: {archive_path}')
		expected_sha256 = str(file_manifest.get('sha256') or '').strip()
		if expected_sha256 and self._sha256_file(archive_path) != expected_sha256:
			raise CommandError(f'Archive file checksum does not match its manifest: {archive_path}')

	def _sha256_file(self, file_path):
		digest = hashlib.sha256()
		with Path(file_path).open('rb') as file_handle:
			for chunk in iter(lambda: file_handle.read(1024 * 1024), b''):
				digest.update(chunk)
		return digest.hexdigest()