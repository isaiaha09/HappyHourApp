from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0042_businessdirectmessagethread_business_hidden_at'),
	]

	operations = [
		migrations.AddField(
			model_name='accountprofile',
			name='deleted_at',
			field=models.DateTimeField(blank=True, null=True),
		),
	]