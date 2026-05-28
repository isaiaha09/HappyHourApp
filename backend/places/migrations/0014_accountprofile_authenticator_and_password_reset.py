from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0013_deletedbusiness_deleted_from_business_database'),
	]

	operations = [
		migrations.AddField(
			model_name='accountprofile',
			name='password_reset_sent_at',
			field=models.DateTimeField(blank=True, null=True),
		),
		migrations.AddField(
			model_name='accountprofile',
			name='password_reset_token',
			field=models.CharField(blank=True, max_length=64),
		),
		migrations.AddField(
			model_name='accountprofile',
			name='two_factor_pending_secret',
			field=models.CharField(blank=True, max_length=64),
		),
		migrations.AddField(
			model_name='accountprofile',
			name='two_factor_secret',
			field=models.CharField(blank=True, max_length=64),
		),
	]