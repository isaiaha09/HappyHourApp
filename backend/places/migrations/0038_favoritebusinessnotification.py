from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0037_listingsnapshot_suppressed_imported_image_urls'),
		migrations.swappable_dependency(settings.AUTH_USER_MODEL),
	]

	operations = [
		migrations.CreateModel(
			name='FavoriteBusinessNotification',
			fields=[
				('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
				('listing_slug', models.SlugField(max_length=170)),
				('business_name', models.CharField(max_length=150)),
				('event_type', models.CharField(choices=[('profile_update', 'Business Profile Update'), ('special', 'Special'), ('announcement', 'Announcement'), ('event', 'Event'), ('blog', 'Blog Post')], max_length=24)),
				('title', models.CharField(max_length=180)),
				('message', models.CharField(blank=True, max_length=400)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('source_post', models.ForeignKey(blank=True, null=True, on_delete=models.SET_NULL, related_name='favorite_notifications', to='places.businesspost')),
				('user', models.ForeignKey(on_delete=models.CASCADE, related_name='favorite_business_notifications', to=settings.AUTH_USER_MODEL)),
			],
			options={
				'ordering': ['-created_at', '-id'],
			},
		),
		migrations.AddIndex(
			model_name='favoritebusinessnotification',
			index=models.Index(fields=['user', '-created_at'], name='places_favo_user_id_420724_idx'),
		),
		migrations.AddIndex(
			model_name='favoritebusinessnotification',
			index=models.Index(fields=['listing_slug', '-created_at'], name='places_favo_listing_8f7e7d_idx'),
		),
	]