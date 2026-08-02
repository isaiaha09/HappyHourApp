from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0045_rename_places_favo_user_id_420724_idx_places_favo_user_id_4ad135_idx_and_more'),
	]

	operations = [
		migrations.AlterField(
			model_name='favoritebusinesspushdevice',
			name='installation_id',
			field=models.CharField(max_length=80),
		),
		migrations.AlterField(
			model_name='favoritebusinesspushdevice',
			name='expo_push_token',
			field=models.CharField(max_length=255),
		),
		migrations.AddConstraint(
			model_name='favoritebusinesspushdevice',
			constraint=models.UniqueConstraint(fields=('user', 'installation_id'), name='unique_user_push_installation'),
		),
		migrations.AddConstraint(
			model_name='favoritebusinesspushdevice',
			constraint=models.UniqueConstraint(fields=('user', 'expo_push_token'), name='unique_user_expo_push_token'),
		),
	]