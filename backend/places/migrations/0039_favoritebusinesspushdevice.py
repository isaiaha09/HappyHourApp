from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0038_favoritebusinessnotification'),
		migrations.swappable_dependency(settings.AUTH_USER_MODEL),
	]

	operations = [
		migrations.CreateModel(
			name='FavoriteBusinessPushDevice',
			fields=[
				('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
				('installation_id', models.CharField(max_length=80, unique=True)),
				('expo_push_token', models.CharField(max_length=255, unique=True)),
				('platform', models.CharField(choices=[('ios', 'iOS'), ('android', 'Android')], max_length=20)),
				('is_active', models.BooleanField(default=True)),
				('last_error', models.CharField(blank=True, max_length=255)),
				('last_registered_at', models.DateTimeField(auto_now=True)),
				('last_push_sent_at', models.DateTimeField(blank=True, null=True)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('user', models.ForeignKey(on_delete=models.CASCADE, related_name='favorite_business_push_devices', to=settings.AUTH_USER_MODEL)),
			],
			options={
				'ordering': ['-last_registered_at', '-created_at'],
			},
		),
		migrations.AddIndex(
			model_name='favoritebusinesspushdevice',
			index=models.Index(fields=['user', 'is_active'], name='places_favo_user_id_6d8ba3_idx'),
		),
	]