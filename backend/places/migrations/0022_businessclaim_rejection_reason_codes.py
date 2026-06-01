from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0021_businessclaim_launch_verification'),
	]

	operations = [
		migrations.AddField(
			model_name='businessclaim',
			name='rejection_reason_codes',
			field=models.JSONField(blank=True, default=list),
		),
	]