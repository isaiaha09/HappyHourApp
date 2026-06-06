from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0029_businessclaim_social_profiles'),
	]

	operations = [
		migrations.AddField(
			model_name='businessclaim',
			name='deal_overrides',
			field=models.JSONField(blank=True, default=None, null=True),
		),
		migrations.AddField(
			model_name='businessclaim',
			name='operating_hour_overrides',
			field=models.JSONField(blank=True, default=None, null=True),
		),
	]