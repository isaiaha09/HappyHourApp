from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

	dependencies = [
		('places', '0011_alter_listingsnapshot_options'),
		migrations.swappable_dependency(settings.AUTH_USER_MODEL),
	]

	operations = [
		migrations.CreateModel(
			name='AccountProfile',
			fields=[
				('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
				('email_verification_token', models.CharField(blank=True, max_length=64)),
				('email_verification_sent_at', models.DateTimeField(blank=True, null=True)),
				('email_verified_at', models.DateTimeField(blank=True, null=True)),
				('two_factor_enabled', models.BooleanField(default=False)),
				('billing_portal_url', models.URLField(blank=True)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('updated_at', models.DateTimeField(auto_now=True)),
				('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='account_profile', to=settings.AUTH_USER_MODEL)),
			],
			options={
				'ordering': ['user__username'],
				'verbose_name': 'Account Profile',
				'verbose_name_plural': 'Account Profiles',
			},
		),
		migrations.CreateModel(
			name='ProfileAuthToken',
			fields=[
				('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
				('key', models.CharField(max_length=64, unique=True)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('last_used_at', models.DateTimeField(auto_now=True)),
				('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='profile_auth_tokens', to=settings.AUTH_USER_MODEL)),
			],
			options={
				'ordering': ['-last_used_at'],
				'verbose_name': 'Profile Auth Token',
				'verbose_name_plural': 'Profile Auth Tokens',
			},
		),
	]