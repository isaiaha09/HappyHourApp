from django.core.management.base import BaseCommand

from places.services.demo_home_feed import cleanup_demo_home_feed


class Command(BaseCommand):
	help = 'Remove the temporary demo home feed businesses, posts, campaigns, and demo users created for local UI review.'

	def handle(self, *args, **options):
		results = cleanup_demo_home_feed()
		self.stdout.write(
			self.style.SUCCESS(
				'Cleaned up '
				f"{results['user_count']} demo users, "
				f"{results['snapshot_count']} demo businesses, "
				f"{results['claim_count']} claims, "
				f"{results['post_count']} posts, and "
				f"{results['campaign_count']} sponsored campaigns."
			)
		)