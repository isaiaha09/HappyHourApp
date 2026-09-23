from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from places.services.source_listings import RUNTIME_IMPORTER_REGISTRY, load_source_records


IMPORTER_REGISTRY = RUNTIME_IMPORTER_REGISTRY


class Command(BaseCommand):
	help = 'Fetch normalized place and deal data from website sources without writing restaurant catalog records to the database.'

	def add_arguments(self, parser):
		parser.add_argument('--source', default=None, choices=sorted(IMPORTER_REGISTRY.keys()))

	def handle(self, *args, **options):
		source_name = options['source'] or getattr(settings, 'LISTING_SOURCE_NAME', 'business_websites')

		try:
			records = load_source_records(source_name=source_name, force_refresh=True)
			deal_count = sum(len(record.deals) for record in records)
			happy_hour_count = sum(len(deal.happy_hours) for record in records for deal in record.deals)

			self.stdout.write(
				self.style.SUCCESS(
					f'Refreshed {len(records)} places, {deal_count} deals, and {happy_hour_count} happy hour windows for {source_name}. Failed sources retain their last-known-good or configured fallback data. No restaurant or store catalog rows were written to the database.'
				)
			)
		except Exception as exc:
			raise CommandError(str(exc)) from exc
