from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0047_listingsnapshot_tracked_location_address'),
		migrations.swappable_dependency(settings.AUTH_USER_MODEL),
	]

	operations = [
		migrations.AddField(
			model_name='accountprofile',
			name='notifications_paused',
			field=models.BooleanField(default=False),
		),
		migrations.AddField(
			model_name='accountprofile',
			name='preferred_cities',
			field=models.JSONField(blank=True, default=list),
		),
		migrations.AddField(
			model_name='accountprofile',
			name='preferred_days',
			field=models.JSONField(blank=True, default=list),
		),
		migrations.AddField(
			model_name='accountprofile',
			name='preferred_time_periods',
			field=models.JSONField(blank=True, default=list),
		),
		migrations.AddField(
			model_name='accountprofile',
			name='preference_onboarding_completed',
			field=models.BooleanField(default=False),
		),
		migrations.AddField(
			model_name='accountprofile',
			name='preference_onboarding_skipped',
			field=models.BooleanField(default=False),
		),
		migrations.AddField(
			model_name='favoritebusiness',
			name='location_id',
			field=models.PositiveBigIntegerField(blank=True, null=True),
		),
		migrations.AddField(
			model_name='favoritebusiness',
			name='profile_updates_enabled',
			field=models.BooleanField(default=True),
		),
		migrations.AddField(
			model_name='favoritebusiness',
			name='happy_hour_notifications_enabled',
			field=models.BooleanField(default=False),
		),
		migrations.AddField(
			model_name='favoritebusiness',
			name='deal_updates_enabled',
			field=models.BooleanField(default=True),
		),
		migrations.AddField(
			model_name='favoritebusiness',
			name='direct_message_notifications_enabled',
			field=models.BooleanField(default=True),
		),
		migrations.RemoveConstraint(
			model_name='favoritebusiness',
			name='unique_favorite_business_per_user',
		),
		migrations.AddConstraint(
			model_name='favoritebusiness',
			constraint=models.UniqueConstraint(fields=('user', 'listing_slug', 'location_id'), name='unique_favorite_business_location_per_user'),
		),
		migrations.CreateModel(
			name='HappyHourNotificationDelivery',
			fields=[
				('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
				('listing_slug', models.SlugField(max_length=170)),
				('location_id', models.PositiveBigIntegerField(blank=True, null=True)),
				('occurrence_key', models.CharField(max_length=255)),
				('business_name', models.CharField(max_length=150)),
				('title', models.CharField(max_length=180)),
				('message', models.CharField(blank=True, max_length=400)),
				('started_at', models.DateTimeField()),
				('sent_at', models.DateTimeField(auto_now_add=True)),
				('user', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='happy_hour_notification_deliveries', to=settings.AUTH_USER_MODEL)),
			],
			options={
				'ordering': ['-sent_at', '-id'],
			},
		),
		migrations.AddConstraint(
			model_name='happyhournotificationdelivery',
			constraint=models.UniqueConstraint(fields=('user', 'occurrence_key'), name='unique_happy_hour_delivery_per_user'),
		),
		migrations.AddIndex(
			model_name='happyhournotificationdelivery',
			index=models.Index(fields=['occurrence_key'], name='places_happ_occurre_46c901_idx'),
		),
		migrations.AddIndex(
			model_name='happyhournotificationdelivery',
			index=models.Index(fields=['user', '-sent_at'], name='places_happ_user_id_b6ec6f_idx'),
		),
		migrations.AlterField(
			model_name='favoritebusinessnotification',
			name='event_type',
			field=models.CharField(choices=[('profile_update', 'Business Profile Update'), ('happy_hour', 'Happy Hour'), ('special', 'Special'), ('announcement', 'Announcement'), ('event', 'Event'), ('blog', 'Blog Post')], max_length=24),
		),
	]