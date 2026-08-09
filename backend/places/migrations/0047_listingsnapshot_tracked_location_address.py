from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0046_push_device_per_user_constraints'),
	]

	operations = [
		migrations.AddField(
			model_name='listingsnapshot',
			name='tracked_location_address_line_1',
			field=models.CharField(blank=True, max_length=255),
		),
		migrations.AddField(
			model_name='listingsnapshot',
			name='tracked_location_city_label',
			field=models.CharField(blank=True, max_length=120),
		),
	]