from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0034_listing_snapshot_website_url_suppressed'),
	]

	operations = [
		migrations.AddField(
			model_name='listingsnapshot',
			name='deal_overrides_cleared',
			field=models.BooleanField(default=False),
		),
		migrations.AddField(
			model_name='listingsnapshot',
			name='operating_hour_overrides_cleared',
			field=models.BooleanField(default=False),
		),
	]