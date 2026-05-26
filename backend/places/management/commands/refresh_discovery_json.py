from django.core.management.base import BaseCommand, CommandError

from places.services.importers.discovered_json_places import merge_discovery_json_records, write_discovery_json_records
from places.services.importers.here_places import HerePlacesImporter
from places.services.importers.openstreetmap_places import OpenStreetMapPlacesImporter
from places.services.importers.tomtom_places import TomTomPlacesImporter
from places.services.deleted_businesses import filter_deleted_business_records


IMPORTER_REGISTRY = {
	'here_places': HerePlacesImporter,
	'tomtom_places': TomTomPlacesImporter,
	'openstreetmap_places': OpenStreetMapPlacesImporter,
}


class Command(BaseCommand):
	help = 'Fetch raw discovery businesses from live providers and store them in a JSON file instead of the database.'

	def add_arguments(self, parser):
		parser.add_argument('--source', default='here_places', choices=sorted(IMPORTER_REGISTRY.keys()))
		parser.add_argument('--city', choices=['ventura', 'oxnard', 'camarillo'])
		parser.add_argument('--limit', type=int, default=0)
		parser.add_argument('--replace', action='store_true')

	def handle(self, *args, **options):
		importer_class = IMPORTER_REGISTRY[options['source']]
		discovery_importer = importer_class()
		limit = max(0, options.get('limit') or 0)
		selected_city = str(options.get('city') or '').strip().lower()

		try:
			discovery_records = list(discovery_importer.load_records())
			filtered_records = filter_deleted_business_records(discovery_records)
			if selected_city:
				filtered_records = [record for record in filtered_records if str(getattr(record, 'city', '') or '').strip().lower() == selected_city]
			if limit:
				filtered_records = filtered_records[:limit]

			self.stdout.write(
				f'Loaded {len(discovery_records)} discovery candidates, and {len(filtered_records)} businesses to store.'
			)
			self.stdout.write('Writing raw discovery results without website enrichment.')

			if options.get('replace'):
				json_path = write_discovery_json_records(filtered_records)
			else:
				json_path = merge_discovery_json_records(filtered_records)
			deal_count = sum(len(record.deals) for record in filtered_records)
			happy_hour_count = sum(len(deal.happy_hours) for record in filtered_records for deal in record.deals)

			self.stdout.write(
				self.style.SUCCESS(
					f'Wrote {len(filtered_records)} discovery places, {deal_count} deals, and {happy_hour_count} happy hour windows to {json_path}.'
				)
			)
		except Exception as exc:
			raise CommandError(str(exc)) from exc
