from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def backfill_business_identity_snapshots(apps, schema_editor):
	Thread = apps.get_model('places', 'BusinessDirectMessageThread')
	last_pk = 0
	while True:
		threads = list(
			Thread.objects
			.select_related('business_claim__listing_snapshot')
			.filter(pk__gt=last_pk)
			.order_by('pk')[:500]
		)
		if not threads:
			break
		for thread in threads:
			claim = thread.business_claim
			if claim is None:
				continue
			snapshot = claim.listing_snapshot
			thread.business_name_snapshot = snapshot.name
			thread.business_slug_snapshot = snapshot.listing_slug
			thread.business_owner_user_id_snapshot = str(claim.claimant_id)
		Thread.objects.bulk_update(
			threads,
			['business_name_snapshot', 'business_slug_snapshot', 'business_owner_user_id_snapshot'],
		)
		last_pk = threads[-1].pk


class Migration(migrations.Migration):
	dependencies = [
		('places', '0064_business_claim_retry_verification'),
		migrations.swappable_dependency(settings.AUTH_USER_MODEL),
	]

	operations = [
		migrations.AddField(
			model_name='businessdirectmessagethread',
			name='business_name_snapshot',
			field=models.CharField(blank=True, default='', max_length=160),
		),
		migrations.AddField(
			model_name='businessdirectmessagethread',
			name='business_slug_snapshot',
			field=models.SlugField(blank=True, default='', max_length=170),
		),
		migrations.AddField(
			model_name='businessdirectmessagethread',
			name='business_owner_user_id_snapshot',
			field=models.CharField(blank=True, default='', max_length=64),
		),
		migrations.RunPython(backfill_business_identity_snapshots, migrations.RunPython.noop),
		migrations.AlterField(
			model_name='businessdirectmessagethread',
			name='business_claim',
			field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='direct_message_threads', to='places.businessclaim'),
		),
	]
