from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0016_listingsnapshot_tracked_location_and_mobile_venue'),
	]

	operations = [
		migrations.AddField(
			model_name='businessclaim',
			name='business_website_url',
			field=models.URLField(blank=True),
		),
		migrations.AddField(
			model_name='businessclaim',
			name='hours_of_operation_entries',
			field=models.JSONField(blank=True, default=list),
		),
		migrations.AddField(
			model_name='businessclaim',
			name='offer_entries',
			field=models.JSONField(blank=True, default=list),
		),
		migrations.AddField(
			model_name='businessclaim',
			name='pathway',
			field=models.CharField(choices=[('claimed', 'Claimed Business'), ('established', 'Create Business Profile'), ('informal', 'Informal Business or Vendor')], default='claimed', max_length=20),
		),
		migrations.AddField(
			model_name='businessclaim',
			name='photo_references',
			field=models.JSONField(blank=True, default=list),
		),
		migrations.AddField(
			model_name='businessclaim',
			name='serves_multiple_areas',
			field=models.BooleanField(default=False),
		),
		migrations.AddField(
			model_name='businessclaim',
			name='social_media_links',
			field=models.JSONField(blank=True, default=list),
		),
		migrations.AddField(
			model_name='businessclaim',
			name='verification_documents',
			field=models.JSONField(blank=True, default=dict),
		),
		migrations.AddField(
			model_name='listingsnapshot',
			name='serves_multiple_areas',
			field=models.BooleanField(default=False),
		),
	]