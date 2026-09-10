from django.db import migrations, models


def disable_existing_business_location_tracking(apps, schema_editor):
	"""Require every existing business to opt in again before live tracking."""
	AccountProfile = apps.get_model('places', 'AccountProfile')
	AccountProfile.objects.filter(business_location_tracking_enabled=True).update(
		business_location_tracking_enabled=False,
	)


class Migration(migrations.Migration):

	dependencies = [
		('places', '0061_businessclaimattachment_malware_scan'),
	]

	operations = [
		migrations.AlterField(
			model_name='accountprofile',
			name='business_location_tracking_enabled',
			field=models.BooleanField(default=False),
		),
		migrations.RunPython(
			disable_existing_business_location_tracking,
			migrations.RunPython.noop,
		),
	]
