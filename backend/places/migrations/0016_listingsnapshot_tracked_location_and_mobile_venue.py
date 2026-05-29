from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0015_accountprofile_email_verification_code'),
	]

	operations = [
		migrations.AddField(
			model_name='listingsnapshot',
			name='tracked_location_accuracy_meters',
			field=models.FloatField(blank=True, null=True),
		),
		migrations.AddField(
			model_name='listingsnapshot',
			name='tracked_location_latitude',
			field=models.FloatField(blank=True, null=True),
		),
		migrations.AddField(
			model_name='listingsnapshot',
			name='tracked_location_longitude',
			field=models.FloatField(blank=True, null=True),
		),
		migrations.AddField(
			model_name='listingsnapshot',
			name='tracked_location_updated_at',
			field=models.DateTimeField(blank=True, null=True),
		),
	]