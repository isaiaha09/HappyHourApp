from django.conf import settings
from django.db import migrations, models
from django.db.models import Q
import django.db.models.deletion


class Migration(migrations.Migration):
	dependencies = [
		('places', '0065_preserve_direct_messages_when_business_is_deleted'),
		migrations.swappable_dependency(settings.AUTH_USER_MODEL),
	]

	operations = [
		migrations.AddField(
			model_name='listingsnapshot',
			name='latitude',
			field=models.FloatField(blank=True, null=True),
		),
		migrations.AddField(
			model_name='listingsnapshot',
			name='longitude',
			field=models.FloatField(blank=True, null=True),
		),
		migrations.AlterField(
			model_name='managedmedia',
			name='owner',
			field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='managed_media', to=settings.AUTH_USER_MODEL),
		),
		migrations.AlterField(
			model_name='managedmedia',
			name='claim',
			field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='managed_media', to='places.businessclaim'),
		),
		migrations.AddField(
			model_name='managedmedia',
			name='listing_snapshot',
			field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='managed_media', to='places.listingsnapshot'),
		),
		migrations.AddConstraint(
			model_name='managedmedia',
			constraint=models.CheckConstraint(
				condition=(
					Q(claim__isnull=False, listing_snapshot__isnull=True)
					| Q(claim__isnull=True, listing_snapshot__isnull=False)
				),
				name='places_media_claim_or_listing_chk',
			),
		),
	]
