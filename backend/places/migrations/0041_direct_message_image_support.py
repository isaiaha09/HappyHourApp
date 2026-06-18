from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0040_business_direct_messages'),
	]

	operations = [
		migrations.AlterField(
			model_name='businessdirectmessage',
			name='body',
			field=models.TextField(blank=True, default=''),
		),
		migrations.AddField(
			model_name='businessdirectmessage',
			name='image',
			field=models.ImageField(blank=True, null=True, upload_to='direct-message-images/'),
		),
	]
