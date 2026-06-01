from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0023_allow_repeat_rejected_claim_attempts'),
	]

	operations = [
		migrations.AddField(
			model_name='accountprofile',
			name='business_location_tracking_enabled',
			field=models.BooleanField(default=True),
		),
	]