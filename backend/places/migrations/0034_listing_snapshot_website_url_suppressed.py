from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0033_snapshot_social_profiles'),
	]

	operations = [
		migrations.AddField(
			model_name='deletedbusiness',
			name='website_url_suppressed',
			field=models.BooleanField(default=False),
		),
		migrations.AddField(
			model_name='listingsnapshot',
			name='website_url_suppressed',
			field=models.BooleanField(default=False),
		),
	]