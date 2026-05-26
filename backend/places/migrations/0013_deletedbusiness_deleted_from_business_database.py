from django.db import migrations, models


def seed_bubble_bakery_deleted_business(apps, schema_editor):
	DeletedBusiness = apps.get_model('places', 'DeletedBusiness')
	DeletedBusiness.objects.update_or_create(
		source_name='here_places',
		external_id='here:here:pds:place:8409q56e-64e4d5abd397451783c4bdfe6a363885',
		defaults={
			'deleted_from_business_database': True,
			'name': 'The Bubble Bakery',
			'city': 'camarillo',
			'venue_type': 'cafe',
			'address_line_1': 'Calle Plano',
			'address_line_2': '',
			'neighborhood': '',
			'state': 'CA',
			'postal_code': '93012-8555',
			'phone_number': '+18053830515',
			'website_url': '',
			'source_url': '',
			'payload': {},
		},
	)


def remove_bubble_bakery_deleted_business(apps, schema_editor):
	DeletedBusiness = apps.get_model('places', 'DeletedBusiness')
	DeletedBusiness.objects.filter(
		source_name='here_places',
		external_id='here:here:pds:place:8409q56e-64e4d5abd397451783c4bdfe6a363885',
	).delete()


class Migration(migrations.Migration):

	dependencies = [
		('places', '0012_accountprofile_profileauthtoken'),
	]

	operations = [
		migrations.AddField(
			model_name='deletedbusiness',
			name='deleted_from_business_database',
			field=models.BooleanField(default=True),
		),
		migrations.RunPython(seed_bubble_bakery_deleted_business, remove_bubble_bakery_deleted_business),
	]