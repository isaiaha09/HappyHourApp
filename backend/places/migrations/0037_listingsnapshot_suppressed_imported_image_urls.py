from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0036_listing_snapshot_imported_image_urls'),
	]

	operations = [
		migrations.AddField(
			model_name='listingsnapshot',
			name='suppressed_imported_image_urls',
			field=models.JSONField(blank=True, default=list),
		),
	]