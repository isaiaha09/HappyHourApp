import posixpath
from pathlib import Path
from urllib.parse import unquote, urlparse
from uuid import UUID

from django.conf import settings
from django.core.files.storage import default_storage
from django.urls import reverse


MANAGED_MEDIA_PREFIXES = (
	'businesses/',
	'business-claim-attachments/',
	'business-deal-attachments/',
	'business-profile-photos/',
	'content-reports/',
)


def managed_media_reference(media_id):
	return f'media:{media_id}'


def _managed_media_uuid_from_reference(reference):
	reference_value = str(reference or '').strip()
	if reference_value.startswith('media:'):
		candidate = reference_value[6:].strip()
	else:
		parsed = urlparse(reference_value)
		segments = [segment for segment in (parsed.path or reference_value).split('/') if segment]
		if len(segments) < 2 or segments[-2] != 'managed-media':
			return None
		candidate = segments[-1]
	try:
		return UUID(candidate)
	except (ValueError, TypeError, AttributeError):
		return None


def managed_media_id_from_reference(reference):
	return _managed_media_uuid_from_reference(reference)


def managed_media_url(media_id, request=None):
	relative_url = reverse('managed-media', kwargs={'media_id': media_id})
	if request is not None:
		return request.build_absolute_uri(relative_url)
	base_url = str(getattr(settings, 'PUBLIC_API_BASE_URL', '') or '').rstrip('/')
	return f'{base_url}{relative_url}' if base_url else relative_url


def save_managed_media(claim, uploaded_file, storage_name, media_kind, request=None):
	from places.models import ManagedMedia

	try:
		uploaded_file.seek(0)
	except (OSError, ValueError):
		pass
	saved_name = default_storage.save(storage_name, uploaded_file)
	media = ManagedMedia.objects.create(
		owner=claim.claimant,
		claim=claim,
		storage_name=saved_name,
		media_kind=media_kind,
		original_filename=str(getattr(uploaded_file, 'name', '') or Path(saved_name).name)[:255],
		content_type=str(getattr(uploaded_file, 'content_type', '') or '')[:120],
		file_size=int(getattr(uploaded_file, 'size', 0) or 0),
	)
	return media, managed_media_url(media.media_id, request=request)


def _iter_media_url_prefix_paths():
	for raw_prefix in {
		str(getattr(settings, 'MEDIA_URL', '') or '').strip(),
		str(getattr(settings, 'MEDIA_PUBLIC_BASE_URL', '') or '').strip(),
		str(getattr(settings, 'PRIVATE_MEDIA_URL', '') or '').strip(),
	}:
		if not raw_prefix:
			continue
		parsed = urlparse(raw_prefix)
		prefix_path = parsed.path if (parsed.scheme or parsed.netloc) else raw_prefix
		prefix_path = f"/{str(prefix_path or '').lstrip('/')}"
		if not prefix_path.endswith('/'):
			prefix_path = f'{prefix_path}/'
		yield prefix_path


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


def extract_managed_storage_name(reference):
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

	if not candidate_name:
		return None
	for prefix_path in _iter_media_url_prefix_paths():
		if candidate_name.startswith(prefix_path):
			candidate_name = candidate_name[len(prefix_path):]
			break

	normalized_name = posixpath.normpath(str(candidate_name).replace('\\', '/').lstrip('/'))
	if normalized_name in {'', '.', '..'} or normalized_name.startswith('../'):
		return None
	if not normalized_name.startswith(MANAGED_MEDIA_PREFIXES):
		return None
	return normalized_name


def _collect_managed_storage_names(references):
	managed_names = set()
	for reference in references or []:
		managed_name = extract_managed_storage_name(reference)
		if managed_name:
			managed_names.add(managed_name)
	return managed_names


def _iter_deal_attachment_references(deal_overrides):
	for deal in deal_overrides or []:
		if not isinstance(deal, dict):
			continue
		attachment = deal.get('attachment')
		if isinstance(attachment, dict):
			yield attachment.get('url')
			yield attachment.get('media_id')


def delete_storage_names(storage_names):
	for storage_name in sorted({str(name or '').strip() for name in storage_names if str(name or '').strip()}):
		default_storage.delete(storage_name)


def _collect_claim_scoped_storage_names(references, claim):
	storage_names = _collect_managed_storage_names(references)
	if not storage_names or claim is None:
		return set()

	from places.models import BusinessClaim, BusinessClaimAttachment, ContentReport, ManagedMedia

	protected_names = set(
		ManagedMedia.objects.filter(storage_name__in=storage_names)
		.exclude(claim=claim, owner_id=claim.claimant_id)
		.values_list('storage_name', flat=True)
	)
	protected_names.update(
		BusinessClaimAttachment.objects.exclude(claim=claim)
		.filter(file__in=storage_names)
		.values_list('file', flat=True)
	)
	protected_names.update(
		ContentReport.objects.filter(screenshot__in=storage_names)
		.values_list('screenshot', flat=True)
	)
	for photo_references, deal_overrides in BusinessClaim.objects.exclude(pk=claim.pk).values_list('photo_references', 'deal_overrides'):
		protected_names.update(_collect_managed_storage_names(photo_references))
		protected_names.update(_collect_managed_storage_names(_iter_deal_attachment_references(deal_overrides)))

	return storage_names - protected_names


def _delete_claim_scoped_storage_names(storage_names, claim):
	if claim is None or not storage_names:
		return

	from places.models import ManagedMedia

	owned_media = ManagedMedia.objects.filter(
		claim=claim,
		owner_id=claim.claimant_id,
		storage_name__in=storage_names,
	)
	owned_names = set(owned_media.values_list('storage_name', flat=True))
	for media in owned_media:
		media.delete()
	delete_storage_names(set(storage_names) - owned_names)


def delete_managed_media_references(references, claim=None):
	from places.models import ManagedMedia

	media_ids = {_managed_media_uuid_from_reference(reference) for reference in references or []}
	media_ids.discard(None)
	queryset = ManagedMedia.objects.filter(media_id__in=media_ids)
	if claim is not None:
		queryset = queryset.filter(claim=claim, owner_id=claim.claimant_id)
	for media in queryset:
		media.delete()


def delete_storage_references(references, claim=None):
	delete_managed_media_references(references, claim=claim)
	if claim is None:
		delete_storage_names(_collect_managed_storage_names(references))
	else:
		_delete_claim_scoped_storage_names(_collect_claim_scoped_storage_names(references, claim), claim)


def delete_removed_storage_references(previous_references, current_references, claim=None):
	previous_media_ids = {_managed_media_uuid_from_reference(reference) for reference in previous_references or []}
	current_media_ids = {_managed_media_uuid_from_reference(reference) for reference in current_references or []}
	previous_media_ids.discard(None)
	current_media_ids.discard(None)
	if previous_media_ids - current_media_ids:
		from places.models import ManagedMedia
		queryset = ManagedMedia.objects.filter(media_id__in=previous_media_ids - current_media_ids)
		if claim is not None:
			queryset = queryset.filter(claim=claim, owner_id=claim.claimant_id)
		for media in queryset:
			media.delete()
	if claim is None:
		previous_names = _collect_managed_storage_names(previous_references)
		current_names = _collect_managed_storage_names(current_references)
	else:
		previous_names = _collect_claim_scoped_storage_names(previous_references, claim)
		current_names = _collect_claim_scoped_storage_names(current_references, claim)
	if claim is None:
		delete_storage_names(previous_names - current_names)
	else:
		_delete_claim_scoped_storage_names(previous_names - current_names, claim)


def get_active_managed_storage_names():
	from places.models import BusinessClaim, BusinessClaimAttachment, ContentReport, ManagedMedia

	active_names = {
		storage_name
		for storage_name in BusinessClaimAttachment.objects.exclude(file='').values_list('file', flat=True)
		if str(storage_name or '').strip()
	}
	active_names.update(ManagedMedia.objects.values_list('storage_name', flat=True))
	for photo_references in BusinessClaim.objects.values_list('photo_references', flat=True):
		active_names.update(_collect_managed_storage_names(photo_references))
	for deal_overrides in BusinessClaim.objects.values_list('deal_overrides', flat=True):
		for deal in deal_overrides or []:
			attachment = deal.get('attachment') if isinstance(deal, dict) else None
			if isinstance(attachment, dict):
				active_names.update(_collect_managed_storage_names([attachment.get('url')]))
	active_names.update(
		str(storage_name).strip()
		for storage_name in ContentReport.objects.exclude(screenshot='').values_list('screenshot', flat=True)
		if str(storage_name or '').strip()
	)
	return active_names


def get_local_managed_storage_names():
	managed_names = set()
	for root_value in (
		getattr(settings, 'MEDIA_ROOT', ''),
		getattr(settings, 'PRIVATE_MEDIA_ROOT', ''),
	):
		media_root = Path(root_value or '')
		if not str(media_root) or not media_root.exists():
			continue
		managed_names.update(
			file_path.relative_to(media_root).as_posix()
			for file_path in media_root.rglob('*')
			if file_path.is_file() and file_path.relative_to(media_root).as_posix().startswith(MANAGED_MEDIA_PREFIXES)
		)
	return managed_names
