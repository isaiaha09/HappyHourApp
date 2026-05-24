from django.core.management.base import BaseCommand

from places.services.source_listings import get_source_place_payloads


class Command(BaseCommand):
    help = 'Preview the current source-backed business listing set without writing restaurant catalog data to the database.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Accepted for backward compatibility but ignored because source-backed mode does not seed catalog data into the database.',
        )

    def handle(self, *args, **options):
        if options['clear']:
            self.stdout.write(self.style.WARNING('Ignored --clear because source-backed mode does not persist place, deal, or happy hour catalog data.'))

        places = get_source_place_payloads()
        deal_count = sum(len(place['deals']) for place in places)
        happy_hour_count = sum(len(deal['happy_hours']) for place in places for deal in place['deals'])

        self.stdout.write(
            self.style.SUCCESS(
                f'Fetched {len(places)} places, {deal_count} deals, and {happy_hour_count} happy hour windows from website sources. No restaurant or store catalog rows were written to the database.'
            )
        )