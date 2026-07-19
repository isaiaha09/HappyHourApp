from django.db import migrations, models
import places.models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0043_accountprofile_deleted_at'),
	]

	operations = [
		migrations.AlterField(
			model_name='businessclaimattachment',
			name='file',
			field=models.FileField(storage=places.models.get_private_media_storage, upload_to=places.models.business_claim_attachment_upload_to),
		),
		migrations.AlterField(
			model_name='businessdirectmessage',
			name='image',
			field=models.ImageField(blank=True, null=True, storage=places.models.get_direct_message_image_storage, upload_to='direct-message-images/'),
		),
	]
