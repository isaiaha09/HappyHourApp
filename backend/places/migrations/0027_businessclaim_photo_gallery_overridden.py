from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('places', '0026_favoritebusiness'),
    ]

    operations = [
        migrations.AddField(
            model_name='businessclaim',
            name='photo_gallery_overridden',
            field=models.BooleanField(default=False),
        ),
    ]
