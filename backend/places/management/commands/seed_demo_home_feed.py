from django.core.management.base import BaseCommand

from places.services.demo_home_feed import seed_demo_home_feed


class Command(BaseCommand):
	help = 'Seed the local database with temporary demo home feed businesses, mixed post types, and sponsored campaigns.'

	def handle(self, *args, **options):
		results = seed_demo_home_feed()
		self.stdout.write(
			self.style.SUCCESS(
				f"Seeded/updated {results['business_count']} demo businesses, {results['post_count']} posts, and {results['campaign_count']} sponsored campaigns."
			)
		)