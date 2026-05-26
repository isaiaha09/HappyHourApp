from django.db import migrations


class Migration(migrations.Migration):

	dependencies = [
		('places', '0010_deletedbusiness'),
	]

	operations = [
		migrations.AlterModelOptions(
			name='listingsnapshot',
			options={
				'ordering': ['name', '-captured_at'],
				'verbose_name': 'Business',
				'verbose_name_plural': 'List of Businesses',
			},
		),
	]