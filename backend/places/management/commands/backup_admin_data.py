import json
import shutil
import sqlite3
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.core.serializers.json import DjangoJSONEncoder
from django.db import connection
from django.utils import timezone

from places.models import ListingSnapshot
from places.services.importers.discovered_json_places import load_discovery_json_records, serialize_imported_place


class Command(BaseCommand):
	help = 'Create a timestamped backup bundle for the local admin database, listing snapshots, and discovery files.'

	def add_arguments(self, parser):
		parser.add_argument(
			'--output-dir',
			default='',
			help='Directory where the timestamped backup folder should be created. Defaults to backend/backups.',
		)
		parser.add_argument(
			'--label',
			default='admin-backup',
			help='Prefix for the created backup folder name.',
		)

	def handle(self, *args, **options):
		backup_dir = self._build_backup_dir(options)
		backup_dir.mkdir(parents=True, exist_ok=False)

		manifest = {
			'generated_at': timezone.now(),
			'backup_dir': str(backup_dir),
			'database_vendor': connection.vendor,
		}

		sqlite_backup_name = self._backup_sqlite_database(backup_dir)
		if sqlite_backup_name:
			manifest['sqlite_database_backup'] = sqlite_backup_name

		self.stdout.write('Writing portable database fixture...')
		dumpdata_name = self._write_database_fixture(backup_dir)
		manifest['database_fixture'] = dumpdata_name

		self.stdout.write('Writing listing snapshot export...')
		snapshot_export_name, snapshot_count = self._write_listing_snapshot_export(backup_dir)
		manifest['listing_snapshot_export'] = snapshot_export_name
		manifest['listing_snapshot_count'] = snapshot_count

		self.stdout.write('Copying local discovery files...')
		copied_files = self._copy_runtime_files(backup_dir)
		manifest['copied_runtime_files'] = copied_files

		manifest_path = backup_dir / 'manifest.json'
		manifest_path.write_text(json.dumps(manifest, indent=2, cls=DjangoJSONEncoder), encoding='utf-8')

		self.stdout.write(self.style.SUCCESS(f'Created backup bundle at {backup_dir}'))
		if sqlite_backup_name:
			self.stdout.write(f' - SQLite backup: {sqlite_backup_name}')
		self.stdout.write(f' - Database fixture: {dumpdata_name}')
		self.stdout.write(f' - Listing snapshot export: {snapshot_export_name} ({snapshot_count} snapshots)')
		for copied_file in copied_files:
			self.stdout.write(f' - Copied runtime file: {copied_file}')

	def _build_backup_dir(self, options):
		base_dir = Path(options.get('output_dir') or (Path(settings.BASE_DIR) / 'backups'))
		label = str(options.get('label') or 'admin-backup').strip() or 'admin-backup'
		timestamp = timezone.localtime(timezone.now()).strftime('%Y%m%d-%H%M%S')
		return base_dir / f'{label}-{timestamp}'

	def _backup_sqlite_database(self, backup_dir):
		if connection.vendor != 'sqlite':
			self.stdout.write(self.style.WARNING('Skipping raw SQLite copy because the active database is not SQLite.'))
			return ''

		connection.ensure_connection()
		source_connection = connection.connection
		if source_connection is None:
			raise CommandError('Could not open the active SQLite database connection for backup.')

		target_path = backup_dir / 'db.sqlite3'
		target_connection = sqlite3.connect(str(target_path))
		try:
			source_connection.backup(target_connection)
		finally:
			target_connection.close()

		return target_path.name

	def _write_database_fixture(self, backup_dir):
		fixture_path = backup_dir / 'database-fixture.json'
		with fixture_path.open('w', encoding='utf-8') as fixture_handle:
			call_command(
				'dumpdata',
				exclude=['auth.permission', 'contenttypes', 'sessions'],
				indent=2,
				stdout=fixture_handle,
			)
		return fixture_path.name

	def _write_listing_snapshot_export(self, backup_dir):
		export_path = backup_dir / 'listing-snapshots.json'
		discovery_lookup = self._build_discovery_lookup()
		payload = {
			'generated_at': timezone.now(),
			'snapshot_count': 0,
			'snapshots': [],
		}

		queryset = ListingSnapshot.objects.order_by('name', 'pk')
		for snapshot in queryset:
			payload['snapshots'].append(self._serialize_listing_snapshot(snapshot, discovery_lookup))

		payload['snapshot_count'] = len(payload['snapshots'])
		export_path.write_text(json.dumps(payload, indent=2, cls=DjangoJSONEncoder), encoding='utf-8')
		return export_path.name, payload['snapshot_count']

	def _serialize_listing_snapshot(self, snapshot, discovery_lookup):
		field_payload = {
			field.name: field.value_from_object(snapshot)
			for field in snapshot._meta.concrete_fields
		}
		matched_record = self._match_discovery_record(snapshot, discovery_lookup)
		return {
			'id': snapshot.pk,
			'name': snapshot.name,
			'listing_slug': snapshot.listing_slug,
			'source_name': snapshot.source_name,
			'city_label': snapshot.get_city_display() or snapshot.city,
			'venue_type_label': snapshot.get_venue_type_display() or snapshot.venue_type,
			'fields': field_payload,
			'display_data': {
				'imported_image_urls': list(snapshot.imported_image_urls or []),
				'manual_deal_overrides': snapshot.deal_overrides,
				'manual_operating_hour_overrides': snapshot.operating_hour_overrides,
				'stored_discovery_record': serialize_imported_place(matched_record) if matched_record is not None else None,
			},
		}

	def _build_discovery_lookup(self):
		lookup = {
			'by_source_identity': {},
			'by_profile_slug': {},
			'by_location_identity': {},
		}
		discovery_path = getattr(settings, 'DISCOVERY_JSON_PATH', '')
		if not discovery_path:
			return lookup

		for record in load_discovery_json_records(discovery_path):
			source_identity = self._build_source_identity(record.source_name, record.external_id)
			if source_identity and source_identity not in lookup['by_source_identity']:
				lookup['by_source_identity'][source_identity] = record
			profile_slug = str(record.profile_slug or '').strip()
			if profile_slug and profile_slug not in lookup['by_profile_slug']:
				lookup['by_profile_slug'][profile_slug] = record
			location_identity = self._build_location_identity(record.city, record.name, record.address_line_1)
			if location_identity and location_identity not in lookup['by_location_identity']:
				lookup['by_location_identity'][location_identity] = record
		return lookup

	def _match_discovery_record(self, snapshot, discovery_lookup):
		source_identity = self._build_source_identity(snapshot.source_name, snapshot.external_id)
		if source_identity:
			matched_record = discovery_lookup['by_source_identity'].get(source_identity)
			if matched_record is not None:
				return matched_record

		profile_slug = str(snapshot.listing_slug or '').strip()
		if profile_slug:
			matched_record = discovery_lookup['by_profile_slug'].get(profile_slug)
			if matched_record is not None:
				return matched_record

		location_identity = self._build_location_identity(snapshot.city, snapshot.name, snapshot.address_line_1)
		if location_identity:
			return discovery_lookup['by_location_identity'].get(location_identity)
		return None

	def _build_source_identity(self, source_name, external_id):
		resolved_source_name = str(source_name or '').strip().lower()
		resolved_external_id = str(external_id or '').strip().lower()
		if not resolved_source_name or not resolved_external_id:
			return None
		return (resolved_source_name, resolved_external_id)

	def _build_location_identity(self, city, name, address_line_1):
		resolved_city = str(city or '').strip().lower()
		resolved_name = str(name or '').strip().lower()
		resolved_address = str(address_line_1 or '').strip().lower()
		if not resolved_city or not resolved_name:
			return None
		return (resolved_city, resolved_name, resolved_address)

	def _copy_runtime_files(self, backup_dir):
		copied_files = []
		for source_path, target_name in (
			(getattr(settings, 'DISCOVERY_JSON_PATH', ''), 'discovered_places.json'),
			(getattr(settings, 'DISCOVERY_EXCLUSIONS_PATH', ''), 'discovery_exclusions.json'),
		):
			copied_name = self._copy_optional_file(source_path, backup_dir / target_name)
			if copied_name:
				copied_files.append(copied_name)
		return copied_files

	def _copy_optional_file(self, source_path, target_path):
		resolved_source = Path(source_path) if source_path else None
		if resolved_source is None or not resolved_source.exists() or not resolved_source.is_file():
			return ''

		target_path.parent.mkdir(parents=True, exist_ok=True)
		shutil.copy2(resolved_source, target_path)
		return target_path.name