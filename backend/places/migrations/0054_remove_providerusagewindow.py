from django.db import migrations


class Migration(migrations.Migration):
	dependencies = [
		('places', '0053_contentreport_screenshot'),
	]

	operations = [
		migrations.DeleteModel(
			name='ProviderUsageWindow',
		),
	]