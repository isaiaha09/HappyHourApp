from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0025_accountprofile_pending_email_change'),
		migrations.swappable_dependency(settings.AUTH_USER_MODEL),
	]

	operations = [
		migrations.CreateModel(
			name='FavoriteBusiness',
			fields=[
				('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
				('listing_slug', models.SlugField(max_length=170)),
				('name', models.CharField(max_length=150)),
				('city', models.CharField(blank=True, max_length=20)),
				('city_label', models.CharField(blank=True, max_length=40)),
				('venue_type', models.CharField(blank=True, max_length=20)),
				('venue_type_label', models.CharField(blank=True, max_length=60)),
				('address_line_1', models.CharField(blank=True, max_length=255)),
				('website_url', models.URLField(blank=True)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('updated_at', models.DateTimeField(auto_now=True)),
				('user', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='favorite_businesses', to=settings.AUTH_USER_MODEL)),
			],
			options={
				'ordering': ['name', 'city_label', '-created_at'],
			},
		),
		migrations.AddConstraint(
			model_name='favoritebusiness',
			constraint=models.UniqueConstraint(fields=('user', 'listing_slug'), name='unique_favorite_business_per_user'),
		),
	]