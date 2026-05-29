from django.db import migrations, models

import places.models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0017_businessclaim_pathway_and_structured_fields'),
	]

	operations = [
		migrations.CreateModel(
			name='BusinessClaimAttachment',
			fields=[
				('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
				('attachment_kind', models.CharField(choices=[('social_media', 'Social Media Attachment'), ('business_registration', 'Business Registration Attachment'), ('health_permit', 'Health Permit Attachment'), ('abc_license', 'ABC License Attachment'), ('proof_of_address_control', 'Proof of Address Control Attachment')], max_length=40)),
				('file', models.FileField(upload_to=places.models.business_claim_attachment_upload_to)),
				('original_filename', models.CharField(max_length=255)),
				('content_type', models.CharField(blank=True, max_length=120)),
				('file_size', models.PositiveIntegerField(default=0)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('claim', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='attachments', to='places.businessclaim')),
			],
			options={
				'ordering': ['attachment_kind', 'created_at'],
				'verbose_name': 'Business Claim Attachment',
				'verbose_name_plural': 'Business Claim Attachments',
			},
		),
	]
