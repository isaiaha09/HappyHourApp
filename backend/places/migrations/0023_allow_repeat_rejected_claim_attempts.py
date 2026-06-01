from django.db import migrations, models


class Migration(migrations.Migration):

	dependencies = [
		('places', '0022_businessclaim_rejection_reason_codes'),
	]

	operations = [
		migrations.RemoveConstraint(
			model_name='businessclaim',
			name='unique_claimant_listing_snapshot_claim',
		),
		migrations.AddConstraint(
			model_name='businessclaim',
			constraint=models.UniqueConstraint(
				condition=models.Q(('status', 'rejected'), _negated=True),
				fields=('claimant', 'listing_snapshot'),
				name='unique_active_claimant_listing_snapshot_claim',
			),
		),
	]