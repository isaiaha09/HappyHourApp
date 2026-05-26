from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0008_businessclaim_employer_address_and_more'),
	]

	operations = [
		migrations.CreateModel(
			name='ProviderUsageWindow',
			fields=[
				('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
				('provider_name', models.CharField(max_length=80)),
				('window_kind', models.CharField(choices=[('day', 'Day'), ('month', 'Month')], max_length=10)),
				('window_start', models.DateField()),
				('consumed_transactions', models.PositiveIntegerField(default=0)),
				('transaction_limit', models.PositiveIntegerField(default=0)),
				('reserve_threshold', models.PositiveIntegerField(default=0)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('updated_at', models.DateTimeField(auto_now=True)),
			],
			options={
				'ordering': ['provider_name', '-window_start'],
				'verbose_name': 'Provider Usage Window',
				'verbose_name_plural': 'Provider Usage Windows',
			},
		),
		migrations.AddConstraint(
			model_name='providerusagewindow',
			constraint=models.UniqueConstraint(fields=('provider_name', 'window_kind', 'window_start'), name='unique_provider_usage_window'),
		),
	]