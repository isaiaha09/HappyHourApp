from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0048_customer_preferences'),
	]

	operations = [
		migrations.AddField(
			model_name='accountprofile',
			name='business_updates_notifications_enabled',
			field=models.BooleanField(default=False),
		),
		migrations.AddField(
			model_name='accountprofile',
			name='direct_message_notifications_enabled',
			field=models.BooleanField(default=False),
		),
		migrations.AddField(
			model_name='accountprofile',
			name='happy_hour_notifications_enabled',
			field=models.BooleanField(default=False),
		),
	]