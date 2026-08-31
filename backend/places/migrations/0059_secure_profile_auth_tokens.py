import hashlib
from datetime import timedelta

from django.db import migrations, models
from django.utils import timezone


def hash_existing_profile_tokens(apps, schema_editor):
	ProfileAuthToken = apps.get_model('places', 'ProfileAuthToken')
	expires_at = timezone.now() + timedelta(days=30)
	for token in ProfileAuthToken.objects.all().iterator():
		token.token_hash = hashlib.sha256(str(token.token_hash).encode('utf-8')).hexdigest()
		token.expires_at = expires_at
		token.save(update_fields=['token_hash', 'expires_at'])


class Migration(migrations.Migration):

	dependencies = [
		('places', '0058_accountprofile_terms_acceptance'),
	]

	operations = [
		migrations.SeparateDatabaseAndState(
			database_operations=[],
			state_operations=[
				migrations.RemoveField(
					model_name='profileauthtoken',
					name='key',
				),
				migrations.AddField(
					model_name='profileauthtoken',
					name='token_hash',
					field=models.CharField(db_column='key', max_length=64, unique=True),
				),
			],
		),
		migrations.AddField(
			model_name='profileauthtoken',
			name='expires_at',
			field=models.DateTimeField(blank=True, null=True),
		),
		migrations.RunPython(hash_existing_profile_tokens, migrations.RunPython.noop),
		migrations.AlterField(
			model_name='profileauthtoken',
			name='expires_at',
			field=models.DateTimeField(),
		),
	]
