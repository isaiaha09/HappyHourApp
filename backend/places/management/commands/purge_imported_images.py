from dataclasses import replace
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from places.models import ListingSnapshot
from places.services.importers.discovered_json_places import load_discovery_json_records, write_discovery_json_records


class Command(BaseCommand):
	help = 'Remove imported business image URLs from snapshots and discovery records without touching owner-uploaded claim photos.'

	def add_arguments(self, parser):
		parser.add_argument(
			'--apply',
			action='store_true',
			help='Write the purge. Without this flag, only a report is produced.',
		)

	def handle(self, *args, **options):
		json_path = Path(getattr(settings, 'DISCOVERY_JSON_PATH', '') or Path(settings.BASE_DIR) / 'config' / 'discovered_places.json')
		if not json_path.exists():
			raise CommandError(f'Discovery JSON file does not exist: {json_path}')

		snapshots = [
			snapshot
			for snapshot in ListingSnapshot.objects.all()
			if snapshot.imported_image_urls or snapshot.suppressed_imported_image_urls
		]
		records = list(load_discovery_json_records(file_path=json_path))
		records_with_images = sum(bool(record.image_urls) for record in records)
		image_url_count = sum(len(record.image_urls) for record in records)

		self.stdout.write(f'Found {len(snapshots)} snapshots with imported image references.')
		self.stdout.write(f'Found {records_with_images} discovery records with {image_url_count} imported image URLs.')
		self.stdout.write('Owner-uploaded BusinessClaim photos are not part of this purge.')

		if not options.get('apply'):
			self.stdout.write('Dry run only. Re-run with --apply to write these changes.')
			return

		temporary_path = json_path.with_name(f'{json_path.name}.image-purge-tmp')
		if temporary_path.exists():
			temporary_path.unlink()
		write_discovery_json_records(
			[replace(record, image_urls=[]) for record in records],
			file_path=temporary_path,
		)

		try:
			with transaction.atomic():
				for snapshot in snapshots:
					snapshot.imported_image_urls = []
					snapshot.suppressed_imported_image_urls = []
					snapshot.save(update_fields=['imported_image_urls', 'suppressed_imported_image_urls', 'updated_at'])
			temporary_path.replace(json_path)
		except Exception:
			if temporary_path.exists():
				temporary_path.unlink()
			raise

		self.stdout.write(self.style.SUCCESS(f'Purged imported image references from {json_path}.'))