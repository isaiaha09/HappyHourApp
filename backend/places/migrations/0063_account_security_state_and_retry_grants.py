import mimetypes
import posixpath
from pathlib import Path
from urllib.parse import unquote, urlparse

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import uuid


LEGACY_CLAIM_MEDIA_PREFIXES = (
	'businesses/',
	'business-claim-attachments/',
	'business-deal-attachments/',
	'business-profile-photos/',
)


def _is_allowed_relative_media_host(hostname):
	normalized_hostname = str(hostname or '').strip().lower().rstrip('.')
	if not normalized_hostname:
		return False
	allowed_hosts = {'localhost', 'localhost.localdomain', 'testserver', '127.0.0.1', '::1'}
	for setting_name in ('PUBLIC_API_BASE_URL', 'RENDER_EXTERNAL_HOSTNAME', 'PROFILE_SHARE_HOST'):
		configured_value = str(getattr(settings, setting_name, '') or '').strip()
		parsed_value = urlparse(configured_value if '://' in configured_value else f'//{configured_value}')
		if parsed_value.hostname:
			allowed_hosts.add(parsed_value.hostname.lower().rstrip('.'))
	for configured_host in getattr(settings, 'ALLOWED_HOSTS', ()) or ():
		candidate = str(configured_host or '').strip().lower().lstrip('.').rstrip('.')
		if candidate and candidate != '*':
			allowed_hosts.add(candidate)
	return normalized_hostname in allowed_hosts


def _legacy_claim_storage_name(reference):
	reference_value = str(reference or '').strip()
	if not reference_value:
		return None

	parsed = urlparse(reference_value)
	if parsed.scheme or parsed.netloc:
		candidate_name = ''
		for raw_prefix in (
			str(getattr(settings, 'MEDIA_URL', '') or '').strip(),
			str(getattr(settings, 'MEDIA_PUBLIC_BASE_URL', '') or '').strip(),
			str(getattr(settings, 'PRIVATE_MEDIA_URL', '') or '').strip(),
		):
			if not raw_prefix:
				continue
			prefix = urlparse(raw_prefix)
			if prefix.netloc and parsed.netloc.lower() != prefix.netloc.lower():
				continue
			if not prefix.netloc and not _is_allowed_relative_media_host(parsed.hostname):
				continue
			prefix_path = str(prefix.path or '').rstrip('/')
			if prefix_path and str(parsed.path or '').startswith(f'{prefix_path}/'):
				candidate_name = str(parsed.path or '')[len(prefix_path):]
				break
		if not candidate_name:
			return None
		candidate_name = unquote(candidate_name)
	else:
		candidate_name = unquote(reference_value)

	normalized_name = posixpath.normpath(str(candidate_name).replace('\\', '/').lstrip('/'))
	if normalized_name in {'', '.', '..'} or normalized_name.startswith('../'):
		return None
	if not normalized_name.startswith(LEGACY_CLAIM_MEDIA_PREFIXES):
		return None
	return normalized_name


def _legacy_claim_media_references(claim):
	references = []
	for reference in list(claim.photo_references or []):
		references.append((reference, 'profile_photo'))
	for deal in list(claim.deal_overrides or []):
		attachment = deal.get('attachment') if isinstance(deal, dict) else None
		if isinstance(attachment, dict):
			references.append((attachment.get('url'), 'deal_attachment'))
	return references


def _legacy_managed_media_url(media_id):
	return f'/managed-media/{media_id}/'


def migrate_legacy_claim_media(apps, schema_editor):
	BusinessClaim = apps.get_model('places', 'BusinessClaim')
	ManagedMedia = apps.get_model('places', 'ManagedMedia')

	for claim in BusinessClaim.objects.only('pk', 'claimant_id', 'photo_references', 'deal_overrides').iterator():
		media_by_storage_name = {}
		changed_photo_references = False
		changed_deal_overrides = False
		photo_references = list(claim.photo_references or [])
		for reference, media_kind in _legacy_claim_media_references(claim):
			storage_name = _legacy_claim_storage_name(reference)
			if not storage_name:
				continue
			media = ManagedMedia.objects.filter(storage_name=storage_name).first()
			if media is None:
				media = ManagedMedia.objects.create(
					owner_id=claim.claimant_id,
					claim_id=claim.pk,
					storage_name=storage_name,
					media_kind=media_kind,
					original_filename=Path(storage_name).name[:255] or 'managed-media',
					content_type=mimetypes.guess_type(storage_name)[0] or '',
					file_size=0,
				)
			elif media.claim_id != claim.pk or media.owner_id != claim.claimant_id:
				continue
			media_by_storage_name[storage_name] = media

		for index, reference in enumerate(photo_references):
			storage_name = _legacy_claim_storage_name(reference)
			media = media_by_storage_name.get(storage_name)
			if media is not None:
				photo_references[index] = _legacy_managed_media_url(media.media_id)
				changed_photo_references = True

		deal_overrides = list(claim.deal_overrides or [])
		for deal in deal_overrides:
			if not isinstance(deal, dict) or not isinstance(deal.get('attachment'), dict):
				continue
			attachment = deal['attachment']
			storage_name = _legacy_claim_storage_name(attachment.get('url'))
			media = media_by_storage_name.get(storage_name)
			if media is None:
				continue
			attachment['media_id'] = str(media.media_id)
			attachment['url'] = _legacy_managed_media_url(media.media_id)
			changed_deal_overrides = True

		update_fields = []
		if changed_photo_references:
			claim.photo_references = photo_references
			update_fields.append('photo_references')
		if changed_deal_overrides:
			claim.deal_overrides = deal_overrides
			update_fields.append('deal_overrides')
		if update_fields:
			claim.save(update_fields=update_fields)


def invalidate_legacy_password_reset_tokens(apps, schema_editor):
	AccountProfile = apps.get_model('places', 'AccountProfile')
	AccountProfile.objects.all().update(password_reset_token='')


def _backfill_unique_media_ids(model):
	seen_media_ids = set()
	for primary_key, media_id in model.objects.order_by('pk').values_list('pk', 'media_id').iterator():
		if media_id is None or media_id in seen_media_ids:
			media_id = uuid.uuid4()
			while media_id in seen_media_ids:
				media_id = uuid.uuid4()
			model.objects.filter(pk=primary_key).update(media_id=media_id)
		seen_media_ids.add(media_id)


def backfill_business_claim_attachment_media_ids(apps, schema_editor):
	BusinessClaimAttachment = apps.get_model('places', 'BusinessClaimAttachment')
	_backfill_unique_media_ids(BusinessClaimAttachment)


def backfill_content_report_media_ids(apps, schema_editor):
	ContentReport = apps.get_model('places', 'ContentReport')
	_backfill_unique_media_ids(ContentReport)


class Migration(migrations.Migration):

	dependencies = [
		('places', '0062_business_location_tracking_opt_in'),
	]

	operations = [
		migrations.AddField(
			model_name='accountprofile',
			name='business_claim_suspended',
			field=models.BooleanField(default=False),
		),
		migrations.AddField(
			model_name='accountprofile',
			name='business_claim_suspended_at',
			field=models.DateTimeField(blank=True, null=True),
		),
		migrations.AddField(
			model_name='accountprofile',
			name='password_reset_selector',
			field=models.CharField(blank=True, db_index=True, max_length=32),
		),
		migrations.AddField(
			model_name='accountprofile',
			name='password_reset_token_digest',
			field=models.CharField(blank=True, max_length=64),
		),
		migrations.AddField(
			model_name='businessclaim',
			name='retry_of',
			field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='retry_claims', to='places.businessclaim'),
		),
		migrations.AddField(
			model_name='businessclaimattachment',
			name='media_id',
			field=models.UUIDField(blank=True, editable=False, null=True),
		),
		migrations.AddField(
			model_name='contentreport',
			name='media_id',
			field=models.UUIDField(blank=True, editable=False, null=True),
		),
		migrations.RunPython(backfill_business_claim_attachment_media_ids, migrations.RunPython.noop),
		migrations.RunPython(backfill_content_report_media_ids, migrations.RunPython.noop),
		migrations.AlterField(
			model_name='businessclaimattachment',
			name='media_id',
			field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
		),
		migrations.AlterField(
			model_name='contentreport',
			name='media_id',
			field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
		),
		migrations.AlterField(
			model_name='businessclaimattachment',
			name='malware_scan_status',
			field=models.CharField(choices=[('legacy_unscanned', 'Legacy unscanned'), ('not_applicable', 'Not applicable'), ('clean', 'Clean'), ('provider_unavailable', 'Provider unavailable'), ('rejected', 'Rejected by scanner')], default='legacy_unscanned', max_length=32),
		),
		migrations.CreateModel(
			name='BusinessClaimRetryGrant',
			fields=[
				('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
				('token_selector', models.CharField(max_length=32, unique=True)),
				('token_digest', models.CharField(max_length=64)),
				('expires_at', models.DateTimeField()),
				('used_at', models.DateTimeField(blank=True, null=True)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='business_claim_retry_grants', to='auth.user')),
				('rejected_claim', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='retry_grants', to='places.businessclaim')),
			],
			options={
				'ordering': ['-created_at', '-pk'],
				'indexes': [models.Index(fields=['user', 'expires_at'], name='places_retry_user_exp_idx')],
			},
		),
		migrations.CreateModel(
			name='ManagedMedia',
			fields=[
				('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
				('media_id', models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
				('storage_name', models.CharField(max_length=512, unique=True)),
				('media_kind', models.CharField(max_length=40)),
				('original_filename', models.CharField(max_length=255)),
				('content_type', models.CharField(blank=True, max_length=120)),
				('file_size', models.PositiveIntegerField(default=0)),
				('created_at', models.DateTimeField(auto_now_add=True)),
				('claim', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='managed_media', to='places.businessclaim')),
				('owner', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='managed_media', to='auth.user')),
			],
			options={
				'ordering': ['-created_at', '-pk'],
				'indexes': [models.Index(fields=['owner', 'claim', 'media_kind'], name='places_media_owner_claim_idx')],
			},
		),
		migrations.RunPython(migrate_legacy_claim_media, migrations.RunPython.noop),
		migrations.RunPython(invalidate_legacy_password_reset_tokens, migrations.RunPython.noop),
	]
