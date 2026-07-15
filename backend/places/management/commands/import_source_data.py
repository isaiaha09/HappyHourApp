from django.core.management.base import BaseCommand, CommandError
from django.core.cache import caches
from django.conf import settings

from places.services.source_listings import RUNTIME_IMPORTER_REGISTRY, load_source_records


IMPORTER_REGISTRY = RUNTIME_IMPORTER_REGISTRY


class Command(BaseCommand):
	help = 'Fetch normalized place and deal data from website sources without writing restaurant catalog records to the database.'

	def add_arguments(self, parser):
		parser.add_argument('--source', default='business_websites', choices=sorted(IMPORTER_REGISTRY.keys()))

	def handle(self, *args, **options):
		caches[getattr(settings, 'SOURCE_FETCH_CACHE_ALIAS', 'default')].delete(f"source-records:{options['source']}")

		try:
			records = load_source_records(source_name=options['source'], force_refresh=True)
			deal_count = sum(len(record.deals) for record in records)
			happy_hour_count = sum(len(deal.happy_hours) for record in records for deal in record.deals)

			self.stdout.write(
				self.style.SUCCESS(
					f'Fetched {len(records)} places, {deal_count} deals, and {happy_hour_count} happy hour windows from website sources. No restaurant or store catalog rows were written to the database.'
				)
			)
		except Exception as exc:
			raise CommandError(str(exc)) from exc