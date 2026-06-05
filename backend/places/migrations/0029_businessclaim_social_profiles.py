from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0028_alter_deletedbusiness_venue_type_and_more'),
	]

	operations = [
		migrations.AddField(
			model_name='businessclaim',
			name='social_profiles',
			field=models.JSONField(blank=True, default=dict),
		),
	]