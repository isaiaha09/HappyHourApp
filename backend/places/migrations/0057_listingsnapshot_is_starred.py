from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0056_admin_performance_indexes'),
	]

	operations = [
		migrations.AddField(
			model_name='listingsnapshot',
			name='is_starred',
			field=models.BooleanField(
				default=False,
				help_text='Show a white map marker with a gold star and a star badge on the public business profile. This does not change the business type or filters.',
				verbose_name='Star this business',
			),
		),
	]
