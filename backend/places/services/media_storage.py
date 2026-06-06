import posixpath
from pathlib import Path
from urllib.parse import unquote, urlparse

from django.conf import settings
from django.core.files.storage import default_storage


MANAGED_MEDIA_PREFIXES = (
	'business-claim-attachments/',
	'business-profile-photos/',
)


def _iter_media_url_prefix_paths():
	for raw_prefix in {
		str(getattr(settings, 'MEDIA_URL', '') or '').strip(),
		str(getattr(settings, 'MEDIA_PUBLIC_BASE_URL', '') or '').strip(),
	}:
		if not raw_prefix:
			continue
		parsed = urlparse(raw_prefix)
		prefix_path = parsed.path if (parsed.scheme or parsed.netloc) else raw_prefix
		prefix_path = f"/{str(prefix_path or '').lstrip('/')}"
		if not prefix_path.endswith('/'):
			prefix_path = f'{prefix_path}/'
		yield prefix_path


def extract_managed_storage_name(reference):
	reference_value = str(reference or '').strip()
	if not reference_value:
		return None

	parsed = urlparse(reference_value)
	if parsed.scheme or parsed.netloc:
		candidate_name = unquote(parsed.path or '')
		if not candidate_name:
			return None
		for prefix_path in _iter_media_url_prefix_paths():
			if candidate_name.startswith(prefix_path):
				candidate_name = candidate_name[len(prefix_path):]
				break
		else:
			return None
	else:
		candidate_name = unquote(reference_value)

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


def delete_storage_names(storage_names):
	for storage_name in sorted({str(name or '').strip() for name in storage_names if str(name or '').strip()}):
		default_storage.delete(storage_name)


def delete_storage_references(references):
	delete_storage_names(_collect_managed_storage_names(references))


def delete_removed_storage_references(previous_references, current_references):
	previous_names = _collect_managed_storage_names(previous_references)
	current_names = _collect_managed_storage_names(current_references)
	delete_storage_names(previous_names - current_names)


def get_active_managed_storage_names():
	from places.models import BusinessClaim, BusinessClaimAttachment

	active_names = {
		storage_name
		for storage_name in BusinessClaimAttachment.objects.exclude(file='').values_list('file', flat=True)
		if str(storage_name or '').strip()
	}
	for photo_references in BusinessClaim.objects.values_list('photo_references', flat=True):
		active_names.update(_collect_managed_storage_names(photo_references))
	return active_names


def get_local_managed_storage_names():
	media_root = Path(getattr(settings, 'MEDIA_ROOT', '') or '')
	if not str(media_root):
		return set()
	if not media_root.exists():
		return set()
	return {
		file_path.relative_to(media_root).as_posix()
		for file_path in media_root.rglob('*')
		if file_path.is_file() and file_path.relative_to(media_root).as_posix().startswith(MANAGED_MEDIA_PREFIXES)
	}