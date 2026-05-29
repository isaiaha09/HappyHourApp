from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0014_accountprofile_authenticator_and_password_reset'),
	]

	operations = [
		migrations.AddField(
			model_name='accountprofile',
			name='email_verification_code',
			field=models.CharField(blank=True, max_length=6),
		),
		migrations.AddField(
			model_name='accountprofile',
			name='email_verification_code_sent_at',
			field=models.DateTimeField(blank=True, null=True),
		),
	]
