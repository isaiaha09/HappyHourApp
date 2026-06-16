from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0035_listingsnapshot_structured_override_clear_flags'),
	]

	operations = [
		migrations.AddField(
			model_name='listingsnapshot',
			name='imported_image_urls',
			field=models.JSONField(blank=True, default=list),
		),
		migrations.AddField(
			model_name='deletedbusiness',
			name='imported_image_urls',
			field=models.JSONField(blank=True, default=list),
		),
	]