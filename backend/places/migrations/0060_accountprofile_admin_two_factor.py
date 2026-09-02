from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0059_secure_profile_auth_tokens'),
	]

	operations = [
		migrations.AddField(
			model_name='accountprofile',
			name='admin_two_factor_enabled',
			field=models.BooleanField(default=False),
		),
		migrations.AddField(
			model_name='accountprofile',
			name='admin_two_factor_secret',
			field=models.CharField(blank=True, max_length=64),
		),
		migrations.AddField(
			model_name='accountprofile',
			name='admin_two_factor_pending_secret',
			field=models.CharField(blank=True, max_length=64),
		),
	]
