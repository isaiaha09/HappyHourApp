from django.core.management.base import BaseCommand, CommandError
from places.services.source_listings import RUNTIME_IMPORTER_REGISTRY


IMPORTER_REGISTRY = RUNTIME_IMPORTER_REGISTRY


class Command(BaseCommand):
	help = 'Fetch normalized place and deal data from website sources without writing restaurant catalog records to the database.'

	def add_arguments(self, parser):
		parser.add_argument('--source', default='business_websites', choices=sorted(IMPORTER_REGISTRY.keys()))

	def handle(self, *args, **options):
		importer_class = IMPORTER_REGISTRY[options['source']]
		importer = importer_class()

		try:
			records = importer.load_records()
			deal_count = sum(len(record.deals) for record in records)
			happy_hour_count = sum(len(deal.happy_hours) for record in records for deal in record.deals)

			self.stdout.write(
				self.style.SUCCESS(
					f'Fetched {len(records)} places, {deal_count} deals, and {happy_hour_count} happy hour windows from website sources. No restaurant or store catalog rows were written to the database.'
				)
			)
		except Exception as exc:
			raise CommandError(str(exc)) from exc