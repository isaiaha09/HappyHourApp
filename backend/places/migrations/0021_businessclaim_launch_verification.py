from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0020_alter_deletedbusiness_venue_type_and_more'),
	]

	operations = [
		migrations.AddField(
			model_name='businessclaim',
			name='verification_flags',
			field=models.JSONField(blank=True, default=list),
		),
		migrations.AddField(
			model_name='businessclaim',
			name='verification_score',
			field=models.PositiveSmallIntegerField(default=0),
		),
		migrations.AlterField(
			model_name='businessclaimattachment',
			name='attachment_kind',
			field=models.CharField(choices=[('social_media', 'Social Media Attachment'), ('business_registration', 'Business Registration Attachment'), ('health_permit', 'Health Permit Attachment'), ('abc_license', 'ABC License Attachment'), ('proof_of_address_control', 'Proof of Address Control Attachment'), ('proof_of_authority', 'Proof of Authority Attachment')], max_length=40),
		),
	]