from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('places', '0007_remove_legacy_catalog_models'),
    ]

    operations = [
        migrations.AlterField(
            model_name='businessclaim',
            name='job_title',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='businessclaim',
            name='address_not_applicable',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='businessclaim',
            name='employer_address',
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
