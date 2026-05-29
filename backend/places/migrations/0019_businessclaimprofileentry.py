from django.db import migrations, models


def backfill_business_claim_profile_entries(apps, schema_editor):
	BusinessClaim = apps.get_model('places', 'BusinessClaim')
	BusinessClaimProfileEntry = apps.get_model('places', 'BusinessClaimProfileEntry')

	field_kind_map = {
		'social_media_links': 'social_media_link',
		'offer_entries': 'offer',
		'hours_of_operation_entries': 'operating_hour',
		'photo_references': 'photo_reference',
	}

	entry_rows = []
	for claim in BusinessClaim.objects.all().iterator():
		for field_name, entry_kind in field_kind_map.items():
			for index, value in enumerate(getattr(claim, field_name, []) or []):
				entry_rows.append(
					BusinessClaimProfileEntry(
						claim_id=claim.id,
						entry_kind=entry_kind,
						value=value,
						sort_order=index,
					)
				)
	if entry_rows:
		BusinessClaimProfileEntry.objects.bulk_create(entry_rows)


class Migration(migrations.Migration):

	dependencies = [
		('places', '0018_businessclaimattachment'),
	]

	operations = [
		migrations.CreateModel(
			name='BusinessClaimProfileEntry',
			fields=[
				('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
				('entry_kind', models.CharField(choices=[('social_media_link', 'Social Media Link'), ('offer', 'Offer'), ('operating_hour', 'Operating Hour'), ('photo_reference', 'Photo Reference')], max_length=40)),
				('value', models.TextField()),
				('sort_order', models.PositiveIntegerField(default=0)),
				('metadata', models.JSONField(blank=True, default=dict)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('updated_at', models.DateTimeField(auto_now=True)),
				('claim', models.ForeignKey(on_delete=models.deletion.CASCADE, related_name='profile_entries', to='places.businessclaim')),
			],
			options={
				'ordering': ['entry_kind', 'sort_order', 'id'],
				'verbose_name': 'Business Claim Profile Entry',
				'verbose_name_plural': 'Business Claim Profile Entries',
			},
		),
		migrations.RunPython(backfill_business_claim_profile_entries, migrations.RunPython.noop),
	]