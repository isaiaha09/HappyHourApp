from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0009_providerusagewindow'),
	]

	operations = [
		migrations.CreateModel(
			name='DeletedBusiness',
			fields=[
				('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
				('source_name', models.CharField(blank=True, max_length=80)),
				('source_url', models.URLField(blank=True)),
				('external_id', models.CharField(blank=True, max_length=150)),
				('listing_slug', models.SlugField(blank=True, max_length=170)),
				('name', models.CharField(max_length=150)),
				('city', models.CharField(blank=True, choices=[('ventura', 'Ventura'), ('oxnard', 'Oxnard'), ('camarillo', 'Camarillo')], max_length=20)),
				('venue_type', models.CharField(blank=True, choices=[('restaurant', 'Restaurant'), ('fast_food', 'Fast Food'), ('bar', 'Bar'), ('cafe', 'Cafe'), ('shop', 'Shop'), ('attraction', 'Attraction'), ('other', 'Other')], max_length=20)),
				('address_line_1', models.CharField(max_length=255)),
				('address_line_2', models.CharField(blank=True, max_length=255)),
				('neighborhood', models.CharField(blank=True, max_length=120)),
				('state', models.CharField(default='CA', max_length=2)),
				('postal_code', models.CharField(blank=True, max_length=10)),
				('phone_number', models.CharField(blank=True, max_length=20)),
				('website_url', models.URLField(blank=True)),
				('payload', models.JSONField(blank=True, default=dict)),
				('deleted_at', models.DateTimeField(auto_now_add=True)),
				('updated_at', models.DateTimeField(auto_now=True)),
			],
			options={
				'ordering': ['name', '-deleted_at'],
				'verbose_name': 'Deleted Business',
				'verbose_name_plural': 'Deleted Businesses',
			},
		),
	]