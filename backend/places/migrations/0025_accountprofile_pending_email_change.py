from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0024_accountprofile_business_location_tracking_enabled'),
	]

	operations = [
		migrations.AddField(
			model_name='accountprofile',
			name='email_change_requested_at',
			field=models.DateTimeField(blank=True, null=True),
		),
		migrations.AddField(
			model_name='accountprofile',
			name='pending_email',
			field=models.EmailField(blank=True, max_length=254),
		),
		migrations.AddField(
			model_name='accountprofile',
			name='previous_verified_email',
			field=models.EmailField(blank=True, max_length=254),
		),
	]