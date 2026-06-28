from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0041_direct_message_image_support'),
	]

	operations = [
		migrations.AddField(
			model_name='businessdirectmessagethread',
			name='business_hidden_at',
			field=models.DateTimeField(blank=True, null=True),
		),
	]