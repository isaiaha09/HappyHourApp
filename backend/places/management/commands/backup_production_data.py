import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path
from urllib.parse import parse_qsl, unquote, urlparse

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from places.services.discovery_exclusions import get_discovery_exclusions_path
from places.services.importers.discovered_json_places import get_discovery_json_path, get_discovery_json_seed_path
from places.services.production_backup import build_supabase_client, get_supabase_bucket_configs, safe_storage_relative_path


class Command(BaseCommand):
	help = 'Create a production backup containing a PostgreSQL dump, Supabase media objects, and discovery files.'

	def add_arguments(self, parser):
		parser.add_argument(
			'--output-dir',
			default=str(Path.home() / 'DiningDealzBackups'),
			help='Directory where the timestamped backup folder should be created. Defaults outside the repository.',
		)
		parser.add_argument(
			'--label',
			default='production-backup',
			help='Prefix for the created backup folder name.',
		)
		parser.add_argument(
			'--database-url-env',
			default='BACKUP_DATABASE_URL',
			help='Environment variable containing the Render external PostgreSQL URL.',
		)
		parser.add_argument(
			'--pg-dump-path',
			default='pg_dump',
			help='Executable name or full path for the PostgreSQL pg_dump client.',
		)

	def handle(self, *args, **options):
		backup_dir = self._build_backup_dir(options)
		backup_dir.mkdir(parents=True, exist_ok=False)

		manifest = {
			'backup_format_version': 1,
			'status': 'in_progress',
			'generated_at': timezone.now().isoformat(),
			'database': {},
			'storage_buckets': [],
			'discovery_files': [],
		}

		self.stdout.write('Exporting PostgreSQL database...')
		manifest['database'] = self._write_postgres_dump(backup_dir, options)

		self.stdout.write('Downloading Supabase storage objects...')
		manifest['storage_buckets'] = self._write_storage_backup(backup_dir)

		self.stdout.write('Copying file-based discovery data...')
		manifest['discovery_files'] = self._write_discovery_backup(backup_dir)

		manifest['status'] = 'complete'
		manifest_path = backup_dir / 'manifest.json'
		manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True), encoding='utf-8')

		self.stdout.write(self.style.SUCCESS(f'Created production backup at {backup_dir}'))
		self.stdout.write(f" - PostgreSQL dump: {manifest['database']['file']}")
		for bucket in manifest['storage_buckets']:
			self.stdout.write(f" - {bucket['label']}: {bucket['object_count']} object(s)")
		for discovery_file in manifest['discovery_files']:
			if discovery_file['present']:
				self.stdout.write(f" - Discovery file: {discovery_file['file']}")
			else:
				self.stdout.write(f" - Discovery file missing: {discovery_file['role']}")

	def _build_backup_dir(self, options):
		base_dir = Path(options['output_dir']).expanduser()
		label = str(options.get('label') or 'production-backup').strip() or 'production-backup'
		timestamp = timezone.localtime(timezone.now()).strftime('%Y%m%d-%H%M%S')
		return base_dir / f'{label}-{timestamp}'

	def _write_postgres_dump(self, backup_dir, options):
		env_name = str(options['database_url_env']).strip() or 'BACKUP_DATABASE_URL'
		database_url = os.environ.get(env_name, '').strip()
		if not database_url:
			raise CommandError(
				f'{env_name} is not set. Set it to the Render external PostgreSQL URL before running this command.'
			)

		connection_details = self._parse_database_url(database_url)
		dump_path = backup_dir / 'postgresql.dump'
		subprocess_environment = os.environ.copy()
		subprocess_environment['PGPASSWORD'] = connection_details['password']
		subprocess_environment['PGSSLMODE'] = connection_details['sslmode']
		command = [
			str(options['pg_dump_path']),
			'--host',
			connection_details['host'],
			'--port',
			connection_details['port'],
			'--username',
			connection_details['username'],
			'--dbname',
			connection_details['database'],
			'--format=custom',
			'--no-owner',
			'--no-privileges',
			'--no-password',
			'--file',
			str(dump_path),
		]

		try:
			result = subprocess.run(
				command,
				check=False,
				capture_output=True,
				text=True,
				env=subprocess_environment,
			)
		except FileNotFoundError as error:
			raise CommandError(
				'pg_dump was not found. Install the PostgreSQL client tools and ensure pg_dump is on PATH, '
				'or pass --pg-dump-path.'
			) from error

		if result.returncode != 0:
			error_output = (result.stderr or '').strip()[-2000:]
			detail = f' Details: {error_output}' if error_output else ''
			raise CommandError(f'pg_dump failed with exit code {result.returncode}.{detail}')
		if not dump_path.exists() or dump_path.stat().st_size == 0:
			raise CommandError('pg_dump completed without creating a non-empty backup file.')

		return {
			'file': dump_path.name,
			'format': 'custom',
			'url_env': env_name,
			'sha256': self._sha256_file(dump_path),
			'size': dump_path.stat().st_size,
		}

	def _parse_database_url(self, database_url):
		try:
			parsed = urlparse(database_url)
			port = parsed.port
		except ValueError as error:
			raise CommandError('BACKUP_DATABASE_URL is not a valid PostgreSQL connection URL.') from error

		if parsed.scheme.lower() not in {'postgres', 'postgresql'}:
			raise CommandError('The backup database URL must use postgres:// or postgresql://.')

		connection_details = {
			'host': parsed.hostname or '',
			'port': str(port or 5432),
			'username': unquote(parsed.username or ''),
			'password': unquote(parsed.password or ''),
			'database': unquote(parsed.path.lstrip('/')),
			'sslmode': dict(parse_qsl(parsed.query, keep_blank_values=False)).get('sslmode', 'require'),
		}
		missing_fields = [
			field_name
			for field_name in ('host', 'username', 'password', 'database')
			if not connection_details[field_name]
		]
		if missing_fields:
			raise CommandError(
				f'BACKUP_DATABASE_URL is missing required connection fields: {", ".join(missing_fields)}.'
			)
		return connection_details

	def _write_storage_backup(self, backup_dir):
		try:
			client = build_supabase_client()
			bucket_configs = get_supabase_bucket_configs()
		except ValueError as error:
			raise CommandError(str(error)) from error

		bucket_manifests = []
		for bucket_config in bucket_configs:
			bucket_manifest = self._write_bucket_backup(client, bucket_config, backup_dir)
			bucket_manifests.append(bucket_manifest)
		return bucket_manifests

	def _write_bucket_backup(self, client, bucket_config, backup_dir):
		bucket_name = bucket_config['bucket']
		if not bucket_name:
			raise CommandError(f"Supabase bucket is not configured for {bucket_config['label']}.")

		bucket_dir = backup_dir / 'supabase' / bucket_config['label']
		bucket_dir.mkdir(parents=True, exist_ok=True)
		object_summaries = []
		paginator = client.get_paginator('list_objects_v2')
		for page in paginator.paginate(Bucket=bucket_name):
			object_summaries.extend(page.get('Contents', []))

		objects = []
		for object_summary in sorted(object_summaries, key=lambda item: str(item.get('Key') or '')):
			key = str(object_summary.get('Key') or '')
			try:
				relative_path = safe_storage_relative_path(key)
			except ValueError as error:
				raise CommandError(str(error)) from error
			file_path = bucket_dir / relative_path
			file_path.parent.mkdir(parents=True, exist_ok=True)
			head = client.head_object(Bucket=bucket_name, Key=key)
			with file_path.open('wb') as file_handle:
				client.download_fileobj(bucket_name, key, file_handle)

			last_modified = head.get('LastModified') or object_summary.get('LastModified')
			objects.append({
				'key': key,
				'file': file_path.relative_to(backup_dir).as_posix(),
				'size': int(head.get('ContentLength', object_summary.get('Size', file_path.stat().st_size))),
				'sha256': self._sha256_file(file_path),
				'etag': str(head.get('ETag') or object_summary.get('ETag') or '').strip('"'),
				'last_modified': last_modified.isoformat() if hasattr(last_modified, 'isoformat') else str(last_modified or ''),
				'content_type': str(head.get('ContentType') or '').strip(),
				'cache_control': str(head.get('CacheControl') or '').strip(),
				'content_disposition': str(head.get('ContentDisposition') or '').strip(),
				'content_encoding': str(head.get('ContentEncoding') or '').strip(),
				'content_language': str(head.get('ContentLanguage') or '').strip(),
				'metadata': head.get('Metadata') or {},
			})

		return {
			'label': bucket_config['label'],
			'bucket': bucket_name,
			'directory': bucket_dir.relative_to(backup_dir).as_posix(),
			'object_count': len(objects),
			'objects': objects,
		}

	def _write_discovery_backup(self, backup_dir):
		discovery_dir = backup_dir / 'discovery'
		discovery_dir.mkdir(parents=True, exist_ok=True)
		file_specs = (
			('runtime_discovered_places', get_discovery_json_path(), 'runtime-discovered_places.json'),
			('seed_discovered_places', get_discovery_json_seed_path(), 'seed-discovered_places.json'),
			('discovery_exclusions', get_discovery_exclusions_path(), 'discovery-exclusions.json'),
		)
		manifest_entries = []
		for role, source_path, target_name in file_specs:
			source = Path(source_path)
			entry = {'role': role, 'file': f'discovery/{target_name}', 'present': source.exists() and source.is_file()}
			if entry['present']:
				target_path = discovery_dir / target_name
				shutil.copy2(source, target_path)
				entry['size'] = target_path.stat().st_size
				entry['sha256'] = self._sha256_file(target_path)
			manifest_entries.append(entry)
		return manifest_entries

	def _sha256_file(self, file_path):
		digest = hashlib.sha256()
		with Path(file_path).open('rb') as file_handle:
			for chunk in iter(lambda: file_handle.read(1024 * 1024), b''):
				digest.update(chunk)
		return digest.hexdigest()