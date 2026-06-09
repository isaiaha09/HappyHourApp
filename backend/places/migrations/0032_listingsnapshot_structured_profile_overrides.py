from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('places', '0031_businesspost_sponsoredcampaign_feedimpression_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='listingsnapshot',
            name='deal_overrides',
            field=models.JSONField(blank=True, default=None, null=True),
        ),
        migrations.AddField(
            model_name='listingsnapshot',
            name='operating_hour_overrides',
            field=models.JSONField(blank=True, default=None, null=True),
        ),
    ]
