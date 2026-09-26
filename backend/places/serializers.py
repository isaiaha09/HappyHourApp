import io
import json
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

from django.contrib.auth.password_validation import validate_password
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from pypdf import PdfReader
from rest_framework import serializers

from .models import BusinessClaim, BusinessClaimAttachment, BusinessClaimProfileEntry, BusinessClaimRetryGrant, BusinessPost, City, ContentReport, FeedEngagement, FeedImpression, ListingSnapshot, ManagedMedia, SponsoredCampaign, VenueType, business_claim_storage_prefix
from .services.account_profiles import build_account_response, get_approved_business_claims, get_or_create_account_profile, has_active_business_membership, send_business_claim_submission_support_email_safely
from .services.business_profile_overrides import (
	build_deal_payloads,
	build_operating_hour_payloads,
	normalize_deal_overrides,
	normalize_operating_hour_overrides,
	summarize_deal_overrides,
	summarize_operating_hour_overrides,
)
from .services.cloudmersive_scanning import ScanStatus, scan_pdf_file
from .services.content_moderation import get_content_moderation_error
from .services.image_moderation import ImageModerationRejected, ImageModerationUnavailable, get_validated_image_media_type, moderate_uploaded_image, validate_uploaded_image
from .services.media_storage import extract_managed_storage_name, managed_media_id_from_reference, save_managed_media
from .services.social_profiles import build_social_media_links, get_business_website_url, normalize_social_profiles


BUSINESS_DOCUMENT_KEYS = (
	'business_registration',
	'health_permit',
	'abc_license',
	'proof_of_address_control',
)

ATTACHMENT_FIELD_NAME_MAP = {
	'social_media_attachments': BusinessClaimAttachment.AttachmentKind.SOCIAL_MEDIA,
	'business_registration_attachments': BusinessClaimAttachment.AttachmentKind.BUSINESS_REGISTRATION,
	'health_permit_attachments': BusinessClaimAttachment.AttachmentKind.HEALTH_PERMIT,
	'abc_license_attachments': BusinessClaimAttachment.AttachmentKind.ABC_LICENSE,
	'proof_of_address_control_attachments': BusinessClaimAttachment.AttachmentKind.PROOF_OF_ADDRESS_CONTROL,
	'proof_of_authority_attachments': BusinessClaimAttachment.AttachmentKind.PROOF_OF_AUTHORITY,
}

PROFILE_ENTRY_FIELD_KIND_MAP = {
	'social_media_links': BusinessClaim.ProfileEntryKind.SOCIAL_MEDIA_LINK,
	'offer_entries': BusinessClaim.ProfileEntryKind.OFFER,
	'hours_of_operation_entries': BusinessClaim.ProfileEntryKind.OPERATING_HOUR,
	'photo_references': BusinessClaim.ProfileEntryKind.PHOTO_REFERENCE,
}

LIST_JSON_FIELD_NAMES = (
	'social_media_links',
	'offer_entries',
	'hours_of_operation_entries',
	'photo_references',
	'deal_overrides',
	'operating_hour_overrides',
)

DEAL_ATTACHMENT_FIELD_PREFIX = 'deal_attachment_upload_'
SUPPORTED_CLAIM_IMAGE_SUFFIXES = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.heic', '.heif', '.tif', '.tiff'}

DICT_JSON_FIELD_NAMES = (
	'verification_documents',
	'social_profiles',
)

BUSINESS_VERIFICATION_CONSENT_VERSION = '2026-08-16'
TERMS_OF_SERVICE_VERSION = '2026-08-30'
GENERIC_AUTH_FAILURE_MESSAGE = 'Incorrect Username or Password. Please check your credentials and try again.'
MAX_STRUCTURED_JSON_BYTES = 1_000_000
MAX_STRUCTURED_JSON_DEPTH = 5
MAX_STRUCTURED_TEXT_LENGTH = 4_000
MAX_SOCIAL_LINKS = 10
MAX_DEALS = 20
MAX_OPERATING_HOUR_WINDOWS = 14
MAX_PROFILE_PHOTOS = 8


def _validate_structured_value(value, field_name, depth=0):
	if depth > MAX_STRUCTURED_JSON_DEPTH:
		raise serializers.ValidationError({field_name: [f'{field_name} may be nested no deeper than {MAX_STRUCTURED_JSON_DEPTH} levels.']})
	if isinstance(value, str) and len(value) > MAX_STRUCTURED_TEXT_LENGTH:
		raise serializers.ValidationError({field_name: [f'Text values in {field_name} must be {MAX_STRUCTURED_TEXT_LENGTH} characters or fewer.']})
	if isinstance(value, dict):
		for key, child in value.items():
			_validate_structured_value(child, field_name, depth + 1)
	elif isinstance(value, list):
		for child in value:
			_validate_structured_value(child, field_name, depth + 1)
	try:
		encoded = json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
	except (TypeError, ValueError):
		raise serializers.ValidationError({field_name: [f'{field_name} must contain JSON-compatible values.']})
	if len(encoded) > MAX_STRUCTURED_JSON_BYTES:
		raise serializers.ValidationError({field_name: ['Structured profile data must be 1 MB or smaller.']})


def _validate_profile_list_limits(value, field_name, max_count):
	if value is None:
		return
	if len(value) > max_count:
		raise serializers.ValidationError({field_name: [f'{field_name} may contain at most {max_count} entries.']})


def _validate_https_reference_list(value, field_name):
	for reference in value or []:
		parsed = urlparse(str(reference or '').strip())
		if parsed.scheme and parsed.scheme.lower() != 'https':
			raise serializers.ValidationError({field_name: ['Only HTTPS links are allowed.']})


def _normalize_social_profile_payload(raw_profiles=None, business_website_url='', social_media_links=None):
	_validate_structured_value(raw_profiles or {}, 'social_profiles')
	_validate_profile_list_limits(list(social_media_links or []), 'social_media_links', MAX_SOCIAL_LINKS)
	try:
		normalized_social_profiles = normalize_social_profiles(
			raw_profiles,
			fallback_website_url=business_website_url,
			fallback_social_links=social_media_links,
		)
	except ValueError as error:
		raise serializers.ValidationError({'social_profiles': [str(error)]})

	return (
		normalized_social_profiles,
		get_business_website_url(normalized_social_profiles, fallback=business_website_url),
		build_social_media_links(normalized_social_profiles),
	)


def _normalize_business_profile_override_payload(raw_deal_overrides=None, raw_operating_hour_overrides=None):
	_validate_structured_value(raw_deal_overrides or [], 'deal_overrides')
	_validate_structured_value(raw_operating_hour_overrides or [], 'operating_hour_overrides')
	_validate_profile_list_limits(list(raw_deal_overrides or []), 'deal_overrides', MAX_DEALS)
	_validate_profile_list_limits(list(raw_operating_hour_overrides or []), 'operating_hour_overrides', MAX_OPERATING_HOUR_WINDOWS)
	try:
		normalized_deal_overrides = normalize_deal_overrides(raw_deal_overrides)
	except ValueError as error:
		raise serializers.ValidationError({'deal_overrides': [str(error)]})

	try:
		normalized_operating_hour_overrides = normalize_operating_hour_overrides(raw_operating_hour_overrides)
	except ValueError as error:
		raise serializers.ValidationError({'operating_hour_overrides': [str(error)]})

	return (
		normalized_deal_overrides,
		normalized_operating_hour_overrides,
		summarize_deal_overrides(normalized_deal_overrides),
		summarize_operating_hour_overrides(normalized_operating_hour_overrides),
	)


def build_signup_request_data(data):
	if hasattr(data, 'lists'):
		normalized = {
			key: values if len(values) > 1 else values[0]
			for key, values in data.lists()
		}
	else:
		normalized = dict(data)

	for key in LIST_JSON_FIELD_NAMES:
		if key not in normalized:
			continue
		value = normalized[key]
		if isinstance(value, list):
			continue
		if isinstance(value, str):
			stripped = value.strip()
			normalized[key] = json.loads(stripped) if stripped else []

	for key in DICT_JSON_FIELD_NAMES:
		if key not in normalized:
			continue
		value = normalized[key]
		if isinstance(value, dict):
			continue
		if isinstance(value, str):
			stripped = value.strip()
			normalized[key] = json.loads(stripped) if stripped else {}

	for key in (*LIST_JSON_FIELD_NAMES, *DICT_JSON_FIELD_NAMES):
		if key in normalized:
			_validate_structured_value(normalized[key], key)
	return normalized


def _normalize_string_list(value):
	if value is None or value == '':
		return []
	if isinstance(value, str):
		items = value.splitlines()
	else:
		items = list(value)
	return [str(item).strip() for item in items if str(item).strip()]


def _normalize_document_map(value):
	if not value:
		return {key: [] for key in BUSINESS_DOCUMENT_KEYS}
	if not isinstance(value, dict):
		raise serializers.ValidationError('Verification documents must be grouped by document type.')
	_validate_structured_value(value, 'verification_documents')
	return {
		key: _normalize_string_list(value.get(key, []))
		for key in BUSINESS_DOCUMENT_KEYS
	}


def _validate_claim_media_ownership(claim, deal_overrides=None, photo_references=None):
	media_ids = set()
	for reference in photo_references or []:
		if extract_managed_storage_name(reference):
			raise serializers.ValidationError({'photo_references': ['Raw storage URLs are not accepted for managed media.']})
		media_id = managed_media_id_from_reference(reference)
		if media_id is not None:
			media_ids.add(media_id)
	for deal in deal_overrides or []:
		attachment = deal.get('attachment') if isinstance(deal, dict) else None
		if not isinstance(attachment, dict):
			continue
		if extract_managed_storage_name(attachment.get('url')):
			raise serializers.ValidationError({'deal_overrides': ['Raw storage URLs are not accepted for managed media.']})
		media_id = attachment.get('media_id') or attachment.get('url')
		parsed_media_id = managed_media_id_from_reference(media_id)
		if parsed_media_id is not None:
			media_ids.add(parsed_media_id)
	if media_ids and ManagedMedia.objects.filter(
		media_id__in=media_ids,
		owner_id=claim.claimant_id,
		claim_id=claim.pk,
	).count() != len(media_ids):
		raise serializers.ValidationError({'media': ['One or more managed media items do not belong to this business profile.']})


def _get_valid_business_retry_grant(user, token):
	if user is None or not token:
		return None
	grant = (
		BusinessClaimRetryGrant.objects
		.select_related('rejected_claim')
		.filter(user=user, rejected_claim__claimant=user, rejected_claim__status=BusinessClaim.Status.REJECTED)
		.order_by('-created_at', '-pk')
		.first()
	)
	profile = get_or_create_account_profile(user)
	latest_claim = user.business_claims.order_by('-created_at', '-pk').first()
	if (
		grant is None
		or profile is None
		or not profile.email_is_verified
		or not profile.business_claim_suspended
		or latest_claim is None
		or latest_claim.pk != grant.rejected_claim_id
		or latest_claim.status != BusinessClaim.Status.REJECTED
		or not grant.is_active(token)
	):
		return None
	return grant


def _consume_business_retry_grant(user, grant, token):
	if grant is None:
		return
	locked_grant = BusinessClaimRetryGrant.objects.select_for_update().select_related('rejected_claim').get(pk=grant.pk)
	if locked_grant.user_id != user.pk or not locked_grant.is_active(token):
		raise serializers.ValidationError({'retry_token': ['This business claim retry link is invalid or expired.']})
	locked_grant.used_at = timezone.now()
	locked_grant.save(update_fields=['used_at'])


def _require_verification_data_consent(attrs):
	if not attrs.get('verification_data_consent'):
		raise serializers.ValidationError({
			'verification_data_consent': ['Confirm that you understand how business verification materials are collected, used, stored, and deleted.'],
		})


def _pop_verification_data_consent(validated_data):
	validated_data.pop('verification_data_consent', None)
	return {
		'verification_data_consent_at': timezone.now(),
		'verification_data_consent_version': BUSINESS_VERIFICATION_CONSENT_VERSION,
	}


def _normalize_url_identity(value):
	parsed = urlparse(str(value or '').strip())
	netloc = str(parsed.netloc or '').strip().lower().removeprefix('www.')
	path = str(parsed.path or '').strip().rstrip('/').lower()
	if not netloc and not path:
		return ''
	return f'{netloc}{path}'


def _uploaded_file_has_pdf_header(uploaded_file):
	try:
		uploaded_file.seek(0)
		prefix = uploaded_file.read(1024)
		return (prefix or b'').lstrip(b'\xef\xbb\xbf\x00\t\n\x0c\r ').startswith(b'%PDF-')
	except (AttributeError, OSError, ValueError):
		return False
	finally:
		try:
			uploaded_file.seek(0)
		except (AttributeError, OSError, ValueError):
			pass


def _validate_request_image_aggregate(request):
	if request is None:
		return
	max_aggregate_bytes = max(1, int(getattr(settings, 'IMAGE_UPLOAD_MAX_AGGREGATE_BYTES', 20 * 1024 * 1024) or 20 * 1024 * 1024))
	image_bytes = 0
	for uploaded_files in request.FILES.lists():
		for uploaded_file in uploaded_files[1]:
			content_type = str(getattr(uploaded_file, 'content_type', '') or '').strip().lower()
			file_suffix = Path(getattr(uploaded_file, 'name', '') or '').suffix.lower()
			if _uploaded_file_has_pdf_header(uploaded_file):
				continue
			if not (content_type.startswith('image/') or file_suffix in SUPPORTED_CLAIM_IMAGE_SUFFIXES):
				try:
					get_validated_image_media_type(uploaded_file)
				except ImageModerationRejected:
					continue
			try:
				file_size = int(getattr(uploaded_file, 'size', None))
			except (TypeError, ValueError):
				raise serializers.ValidationError({'uploads': ['The uploaded file size could not be validated.']})
			if file_size < 0:
				raise serializers.ValidationError({'uploads': ['The uploaded file size could not be validated.']})
			image_bytes += file_size
			if image_bytes > max_aggregate_bytes:
				raise serializers.ValidationError({'uploads': ['The combined image upload size must be 20 MB or smaller.']})


def _validate_request_verification_pdf_limits(request):
	if request is None:
		return

	max_files = max(1, int(getattr(settings, 'VERIFICATION_PDF_MAX_FILES', 8) or 8))
	max_aggregate_bytes = max(
		1,
		int(getattr(settings, 'VERIFICATION_PDF_MAX_AGGREGATE_BYTES', 20 * 1024 * 1024) or 20 * 1024 * 1024),
	)
	pdf_count = 0
	pdf_bytes = 0
	for request_field_name in ATTACHMENT_FIELD_NAME_MAP:
		for uploaded_file in request.FILES.getlist(request_field_name):
			content_type = str(getattr(uploaded_file, 'content_type', '') or '').strip().lower()
			file_suffix = Path(getattr(uploaded_file, 'name', '') or '').suffix.lower()
			is_pdf_content = _uploaded_file_has_pdf_header(uploaded_file)
			if not is_pdf_content and content_type != 'application/pdf' and file_suffix != '.pdf':
				continue

			pdf_count += 1
			if pdf_count > max_files:
				raise serializers.ValidationError({
					'verification_documents': [f'Upload no more than {max_files} PDF verification documents at a time.'],
				})
			try:
				file_size = int(getattr(uploaded_file, 'size', None))
			except (TypeError, ValueError):
				raise serializers.ValidationError({'verification_documents': ['The uploaded file size could not be validated.']})
			if file_size < 0:
				raise serializers.ValidationError({'verification_documents': ['The uploaded file size could not be validated.']})
			pdf_bytes += file_size
			if pdf_bytes > max_aggregate_bytes:
				max_megabytes = max_aggregate_bytes / (1024 * 1024)
				raise serializers.ValidationError({
					'verification_documents': [f'The combined PDF verification upload size must be {max_megabytes:g} MB or smaller.'],
				})


def _prepare_claim_attachments(request):
	if request is None:
		return []
	_validate_request_verification_pdf_limits(request)
	_validate_request_image_aggregate(request)
	pending_attachments = []
	for request_field_name, attachment_kind in ATTACHMENT_FIELD_NAME_MAP.items():
		for uploaded_file in request.FILES.getlist(request_field_name):
			_validate_claim_attachment_size(uploaded_file, 'verification_documents')
			attachment_format = _validate_claim_attachment_format(uploaded_file)
			if attachment_format == 'pdf':
				_validate_pdf_upload_size(uploaded_file, 'verification_documents')
			else:
				_validate_claim_image_signature(uploaded_file)
			pending_attachments.append({
				'attachment_kind': attachment_kind,
				'uploaded_file': uploaded_file,
				'original_filename': str(getattr(uploaded_file, 'name', '') or ''),
				'content_type': getattr(uploaded_file, 'content_type', '') or '',
				'file_size': getattr(uploaded_file, 'size', 0) or 0,
				'attachment_format': attachment_format,
				'malware_scan_status': BusinessClaimAttachment.MalwareScanStatus.NOT_APPLICABLE,
				'malware_scan_attempted_at': None,
				'malware_scan_provider': '',
				'malware_scan_reason': '',
			})

	for pending_attachment in pending_attachments:
		if pending_attachment['attachment_format'] != 'pdf':
			continue
		scan_result = scan_pdf_file(pending_attachment['uploaded_file'])
		pending_attachment['malware_scan_attempted_at'] = timezone.now()
		pending_attachment['malware_scan_provider'] = 'cloudmersive'
		if scan_result.status == ScanStatus.REJECTED:
			raise serializers.ValidationError({'verification_documents': ['This verification PDF was rejected by the security scan. Upload a different PDF.']})
		if scan_result.status == ScanStatus.UNAVAILABLE:
			failure_mode = str(getattr(settings, 'CLOUDMERSIVE_VIRUS_SCAN_FAILURE_MODE', 'allow') or 'allow').strip().lower()
			if failure_mode == 'block':
				raise serializers.ValidationError({'verification_documents': ['Verification PDF scanning is temporarily unavailable. Please try again.']})
			pending_attachment['malware_scan_status'] = BusinessClaimAttachment.MalwareScanStatus.PROVIDER_UNAVAILABLE
			pending_attachment['malware_scan_reason'] = scan_result.reason[:120]
		elif scan_result.status == ScanStatus.CLEAN:
			pending_attachment['malware_scan_status'] = BusinessClaimAttachment.MalwareScanStatus.CLEAN
		else:
			raise serializers.ValidationError({'verification_documents': ['This verification PDF could not be validated by the security scan.']})

	return pending_attachments


def _create_claim_attachments(claim, request, pending_attachments=None):
	if request is None:
		return
	pending_attachments = _prepare_claim_attachments(request) if pending_attachments is None else pending_attachments

	for pending_attachment in pending_attachments:
		uploaded_file = pending_attachment['uploaded_file']
		try:
			uploaded_file.seek(0)
		except (OSError, ValueError):
			pass
		BusinessClaimAttachment.objects.create(
			claim=claim,
			attachment_kind=pending_attachment['attachment_kind'],
			file=uploaded_file,
			original_filename=pending_attachment['original_filename'],
			content_type=pending_attachment['content_type'],
			file_size=pending_attachment['file_size'],
			malware_scan_status=pending_attachment['malware_scan_status'],
			malware_scan_attempted_at=pending_attachment['malware_scan_attempted_at'],
			malware_scan_provider=pending_attachment['malware_scan_provider'],
			malware_scan_reason=pending_attachment['malware_scan_reason'],
		)


def _create_claim_profile_entries(claim, validated_data):
	entry_rows = []
	for field_name, entry_kind in PROFILE_ENTRY_FIELD_KIND_MAP.items():
		for index, value in enumerate(validated_data.get(field_name, [])):
			entry_rows.append(
				BusinessClaimProfileEntry(
					claim=claim,
					entry_kind=entry_kind,
					value=value,
					sort_order=index,
				)
			)
	if entry_rows:
		BusinessClaimProfileEntry.objects.bulk_create(entry_rows)


def _replace_claim_profile_entries(claim, validated_data):
	claim.profile_entries.filter(entry_kind__in=PROFILE_ENTRY_FIELD_KIND_MAP.values()).delete()
	_create_claim_profile_entries(claim, validated_data)


def merge_uploaded_deal_attachments(request, claim, deal_overrides):
	deal_rows = [dict(row) for row in (deal_overrides or [])]
	for deal_row in deal_rows:
		# This is client-only picker metadata; persist only the uploaded attachment URL.
		deal_row.pop('attachment_upload', None)

	if request is None:
		return deal_rows

	indexed_uploads = _collect_uploaded_deal_attachments(request, len(deal_rows))
	for index, uploaded_file, media_type, file_suffix in indexed_uploads:
		deal_rows[index]['attachment'] = _save_uploaded_deal_attachment(
			request,
			claim,
			uploaded_file,
			media_type=media_type,
			file_suffix=file_suffix,
		)
	return deal_rows


def _collect_uploaded_deal_attachments(request, deal_count):
	indexed_uploads = []
	for request_field_name in request.FILES.keys():
		if not request_field_name.startswith(DEAL_ATTACHMENT_FIELD_PREFIX):
			continue

		index_text = request_field_name[len(DEAL_ATTACHMENT_FIELD_PREFIX):]
		try:
			deal_index = int(index_text)
		except (TypeError, ValueError):
			raise serializers.ValidationError({'deal_overrides': [f'Unexpected deal attachment field "{request_field_name}".']})

		if deal_index < 0 or deal_index >= deal_count:
			raise serializers.ValidationError({'deal_overrides': [f'Deal attachment #{deal_index + 1} does not match an uploaded deal.']})

		uploaded_files = request.FILES.getlist(request_field_name)
		if len(uploaded_files) != 1:
			raise serializers.ValidationError({'deal_overrides': [f'Deal override #{deal_index + 1} can only include one attachment.']})

		media_type, file_suffix = _validate_uploaded_deal_attachment(uploaded_files[0])
		indexed_uploads.append((deal_index, uploaded_files[0], media_type, file_suffix))

	return indexed_uploads


def _validate_uploaded_pdf_content(uploaded_file, field_name):
	_validate_pdf_upload_size(uploaded_file, field_name, force=True)
	max_bytes = max(1, int(getattr(settings, 'PDF_UPLOAD_MAX_BYTES', 10 * 1024 * 1024) or 10 * 1024 * 1024))
	try:
		uploaded_file.seek(0)
		pdf_bytes = uploaded_file.read(max_bytes + 1)
	except (AttributeError, OSError, ValueError) as error:
		raise serializers.ValidationError({field_name: ['The uploaded PDF could not be read.']}) from error
	finally:
		try:
			uploaded_file.seek(0)
		except (AttributeError, OSError, ValueError):
			pass
	if not isinstance(pdf_bytes, bytes) or len(pdf_bytes) > max_bytes:
		max_megabytes = max_bytes / (1024 * 1024)
		raise serializers.ValidationError({field_name: [f'PDF files must be {max_megabytes:g} MB or smaller.']})
	if b'%PDF-' not in pdf_bytes[:1024]:
		raise serializers.ValidationError({field_name: ['The uploaded file must be a valid PDF.']})

	try:
		reader = PdfReader(io.BytesIO(pdf_bytes), strict=False)
		if reader.is_encrypted and not reader.decrypt(''):
			raise ValueError('Password-protected PDFs cannot be validated.')
		catalog = reader.trailer.get('/Root')
		page_tree = catalog.get('/Pages') if catalog is not None else None
		page_count = int(page_tree.get('/Count') or 0) if page_tree is not None else 0
		pages = reader.pages
		if (
			catalog is None
			or str(catalog.get('/Type') or '') != '/Catalog'
			or page_tree is None
			or str(page_tree.get('/Type') or '') != '/Pages'
			or page_count < 1
			or not page_tree.get('/Kids')
			or len(pages) < 1
		):
			raise ValueError('The PDF contains no pages.')
		for page in pages:
			if str(page.get('/Type') or '') != '/Page':
				raise ValueError('The PDF contains an invalid page tree.')
	except Exception as error:
		raise serializers.ValidationError({field_name: ['The uploaded file must be a valid PDF.']}) from error


def _validate_uploaded_deal_attachment(uploaded_file):
	if _uploaded_file_has_pdf_header(uploaded_file):
		_validate_uploaded_pdf_content(uploaded_file, 'deal_overrides')
		return 'application/pdf', '.pdf'

	try:
		media_type, file_suffix = get_validated_image_media_type(uploaded_file)
		moderate_uploaded_image(uploaded_file, surface='business_deal_attachment')
	except ImageModerationRejected as error:
		raise serializers.ValidationError({'deal_overrides': [str(error)]})
	except ImageModerationUnavailable as error:
		raise serializers.ValidationError({'deal_overrides': [str(error)]})
	if media_type not in {'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/heic', 'image/heif', 'image/tiff'}:
		raise serializers.ValidationError({'deal_overrides': ['Deal attachments must be a photo or PDF file.']})
	return media_type, file_suffix


def _validate_pdf_upload_size(uploaded_file, field_name, force=False):
	content_type = str(getattr(uploaded_file, 'content_type', '') or '').strip().lower()
	file_suffix = Path(getattr(uploaded_file, 'name', '') or '').suffix.lower()
	if not force and content_type != 'application/pdf' and file_suffix != '.pdf':
		return
	max_bytes = max(1, int(getattr(settings, 'PDF_UPLOAD_MAX_BYTES', 10 * 1024 * 1024) or 10 * 1024 * 1024))
	file_size = getattr(uploaded_file, 'size', None)
	if file_size not in (None, '') and int(file_size) > max_bytes:
		max_megabytes = max_bytes / (1024 * 1024)
		raise serializers.ValidationError({field_name: [f'PDF files must be {max_megabytes:g} MB or smaller.']})


def _validate_claim_attachment_format(uploaded_file):
	content_type = str(getattr(uploaded_file, 'content_type', '') or '').strip().lower()
	file_suffix = Path(getattr(uploaded_file, 'name', '') or '').suffix.lower()
	if content_type == 'application/pdf' or file_suffix == '.pdf':
		return 'pdf'
	if content_type.startswith('image/') or file_suffix in SUPPORTED_CLAIM_IMAGE_SUFFIXES:
		return 'image'
	raise serializers.ValidationError({'verification_documents': ['Verification attachments must be a PDF or image file.']})


def _validate_claim_image_signature(uploaded_file):
	try:
		validate_uploaded_image(uploaded_file)
	except ImageModerationRejected as error:
		raise serializers.ValidationError({'verification_documents': [str(error)]})


def _validate_claim_attachment_size(uploaded_file, field_name):
	try:
		max_bytes = max(1, int(getattr(settings, 'VERIFICATION_UPLOAD_MAX_BYTES', 3_500_000) or 3_500_000))
		file_size = getattr(uploaded_file, 'size', None)
		if file_size not in (None, '') and int(file_size) > max_bytes:
			max_megabytes = max_bytes / (1024 * 1024)
			raise serializers.ValidationError({field_name: [f'Uploaded files must be {max_megabytes:g} MB or smaller.']})
	except (TypeError, ValueError):
		raise serializers.ValidationError({field_name: ['The uploaded file size could not be validated.']})


def _save_uploaded_deal_attachment(request, claim, uploaded_file, media_type, file_suffix):
	content_type = str(media_type or '').strip().lower()
	uploaded_file.content_type = content_type

	filename_root = Path(getattr(uploaded_file, 'name', '') or 'deal-attachment').stem or 'deal-attachment'
	safe_name = slugify(filename_root) or 'deal-attachment'
	storage_name = (
		f'{business_claim_storage_prefix(claim)}/deal-attachments/{uuid4().hex}-{safe_name}{file_suffix}'
	)
	media, media_url = save_managed_media(claim, uploaded_file, storage_name, 'deal_attachment', request=request)
	attachment_payload = {
		'url': media_url,
		'media_id': str(media.media_id),
		'name': f'{filename_root}{file_suffix}',
	}
	if content_type:
		attachment_payload['content_type'] = content_type
	file_size = getattr(uploaded_file, 'size', None)
	if file_size not in (None, ''):
		attachment_payload['file_size'] = int(file_size)
	return attachment_payload


def _append_uploaded_profile_photos_to_claim(request, claim):
	if request is None or claim is None or getattr(claim, '_profile_photo_uploads_saved', False):
		return

	uploaded_files = request.FILES.getlist('profile_photo_uploads')
	max_photos = max(1, int(getattr(settings, 'BUSINESS_PROFILE_MAX_PHOTOS', 8) or 8))
	max_aggregate_bytes = max(1, int(getattr(settings, 'IMAGE_UPLOAD_MAX_AGGREGATE_BYTES', 20 * 1024 * 1024) or 20 * 1024 * 1024))
	if len(list(claim.photo_references or [])) + len(uploaded_files) > max_photos:
		raise serializers.ValidationError({'photo_uploads': [f'Business profiles can contain at most {max_photos} photos.']})
	declared_total = sum(int(getattr(uploaded_file, 'size', 0) or 0) for uploaded_file in uploaded_files)
	if declared_total > max_aggregate_bytes:
		raise serializers.ValidationError({'photo_uploads': ['The combined photo upload size must be 20 MB or smaller.']})

	uploaded_photo_urls = []
	for uploaded_file in uploaded_files:
		try:
			content_type, file_suffix = get_validated_image_media_type(uploaded_file)
			moderate_uploaded_image(uploaded_file, surface='business_profile_photo')
		except ImageModerationRejected as error:
			raise serializers.ValidationError({'photo_uploads': [str(error)]})
		except ImageModerationUnavailable as error:
			raise serializers.ValidationError({'photo_uploads': [str(error)]})
		uploaded_file.content_type = content_type

		filename_root = Path(getattr(uploaded_file, 'name', '') or 'business-photo').stem or 'business-photo'
		safe_name = slugify(filename_root) or 'business-photo'
		storage_name = (
			f'{business_claim_storage_prefix(claim)}/profile-photos/{uuid4().hex}-{safe_name}{file_suffix}'
		)
		media, media_url = save_managed_media(claim, uploaded_file, storage_name, 'profile_photo', request=request)
		uploaded_photo_urls.append(media_url)

	if not uploaded_photo_urls:
		return

	claim.photo_references = _normalize_string_list([*claim.photo_references, *uploaded_photo_urls])
	claim.photo_gallery_overridden = True
	claim.save(update_fields=['photo_references', 'photo_gallery_overridden', 'updated_at'])
	_replace_claim_profile_entries(
		claim,
		{
			'social_media_links': claim.social_media_links,
			'offer_entries': claim.offer_entries,
			'hours_of_operation_entries': claim.hours_of_operation_entries,
			'photo_references': claim.photo_references,
		},
	)
	claim._profile_photo_uploads_saved = True


class AccountResponseSerializer(serializers.Serializer):
	id = serializers.IntegerField()
	username = serializers.CharField()
	email = serializers.EmailField()
	first_name = serializers.CharField()
	last_name = serializers.CharField()
	detail = serializers.CharField(required=False, allow_blank=True)
	portal = serializers.CharField()
	profile_type = serializers.CharField()
	auth_token = serializers.CharField(required=False, allow_blank=True)
	business_status = serializers.CharField(required=False, allow_blank=True)
	claim_id = serializers.IntegerField(required=False, allow_null=True)
	claim_status = serializers.CharField(required=False, allow_null=True)
	claim_pathway = serializers.CharField(required=False, allow_null=True)
	claim_review_pending = serializers.BooleanField(required=False)
	claim_review_message = serializers.CharField(required=False, allow_blank=True)
	business_name = serializers.CharField(required=False, allow_blank=True)
	email_verified = serializers.BooleanField(required=False)
	email_verification_sent_at = serializers.DateTimeField(required=False, allow_null=True)
	email_verification_required = serializers.BooleanField(required=False)
	verification_code_expires_at = serializers.DateTimeField(required=False, allow_null=True)
	verification_code_ttl_seconds = serializers.IntegerField(required=False)
	two_factor_enabled = serializers.BooleanField(required=False)
	billing_portal_url = serializers.CharField(required=False, allow_blank=True)
	approved_businesses = serializers.ListField(child=serializers.DictField(), required=False)
	sponsored_campaigns = serializers.ListField(child=serializers.DictField(), required=False)
	favorite_businesses = serializers.ListField(child=serializers.DictField(), required=False)
	preference_onboarding_completed = serializers.BooleanField(required=False)
	preference_onboarding_skipped = serializers.BooleanField(required=False)
	preferred_cities = serializers.ListField(required=False)
	preferred_days = serializers.ListField(required=False)
	preferred_time_periods = serializers.ListField(required=False)
	notifications_paused = serializers.BooleanField(required=False)
	direct_message_notifications_enabled = serializers.BooleanField(required=False)
	business_updates_notifications_enabled = serializers.BooleanField(required=False)
	happy_hour_notifications_enabled = serializers.BooleanField(required=False)
	business_contact = serializers.DictField(required=False)
	can_access_places = serializers.BooleanField(required=False)
	two_factor_pending_setup = serializers.BooleanField(required=False)
	business_location_tracking_available = serializers.BooleanField(required=False)
	business_location_tracking_enabled = serializers.BooleanField(required=False)
	requires_business_location_tracking = serializers.BooleanField(required=False)
	tracked_business_location = serializers.DictField(required=False)
	direct_messaging_enabled = serializers.BooleanField(required=False)
	blocked_customer_accounts = serializers.ListField(child=serializers.DictField(), required=False)


class ProfileDashboardUpdateSerializer(serializers.Serializer):
	username = serializers.CharField(max_length=150)
	email = serializers.EmailField()
	first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
	last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
	contact_name = serializers.CharField(max_length=120, required=False)
	job_title = serializers.CharField(max_length=120, required=False, allow_blank=True)
	work_email = serializers.EmailField(required=False)
	work_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
	employer_address = serializers.CharField(max_length=255, required=False, allow_blank=True)
	business_website_url = serializers.URLField(required=False, allow_blank=True)
	social_profiles = serializers.JSONField(required=False)
	deal_overrides = serializers.JSONField(required=False)
	operating_hour_overrides = serializers.JSONField(required=False)
	social_media_links_text = serializers.CharField(max_length=4000, required=False, allow_blank=True)
	offer_entries_text = serializers.CharField(max_length=4000, required=False, allow_blank=True)
	hours_of_operation_entries_text = serializers.CharField(max_length=4000, required=False, allow_blank=True)
	photo_references_text = serializers.CharField(max_length=4000, required=False, allow_blank=True)
	supporting_details = serializers.CharField(max_length=4000, required=False, allow_blank=True)
	direct_messaging_enabled = serializers.BooleanField(required=False)

	def validate_username(self, value):
		normalized = value.strip()
		if not normalized:
			raise serializers.ValidationError('Enter a username.')
		user = self.context['request'].user
		if User.objects.exclude(pk=user.pk).filter(username__iexact=normalized).exists():
			raise serializers.ValidationError('That username is already in use.')
		return normalized

	def validate_email(self, value):
		normalized = value.strip().lower()
		user = self.context['request'].user
		if User.objects.exclude(pk=user.pk).filter(email__iexact=normalized).exists():
			raise serializers.ValidationError('That email address is already in use.')
		return normalized

	def validate_first_name(self, value):
		return value.strip()

	def validate_last_name(self, value):
		return value.strip()

	def validate_contact_name(self, value):
		return value.strip()

	def validate_job_title(self, value):
		return value.strip()

	def validate_work_email(self, value):
		return value.strip().lower()

	def validate_work_phone(self, value):
		return value.strip()

	def validate_employer_address(self, value):
		return value.strip()

	def validate_business_website_url(self, value):
		return value.strip()

	def validate_supporting_details(self, value):
		return value.strip()

	def validate(self, attrs):
		attrs = super().validate(attrs)
		for field_name in ('social_profiles', 'deal_overrides', 'operating_hour_overrides'):
			if field_name in attrs:
				_validate_structured_value(attrs[field_name], field_name)
		if any(field_name in attrs for field_name in ('social_profiles', 'social_media_links_text', 'business_website_url')):
			legacy_social_links = _normalize_string_list(attrs.get('social_media_links_text', '')) if 'social_media_links_text' in attrs else []
			normalized_social_profiles, normalized_website_url, normalized_social_links = _normalize_social_profile_payload(
				attrs.get('social_profiles', {}),
				business_website_url=attrs.get('business_website_url', ''),
				social_media_links=legacy_social_links,
			)
			attrs['social_profiles'] = normalized_social_profiles
			attrs['business_website_url'] = normalized_website_url
			attrs['social_media_links_text'] = '\n'.join(normalized_social_links)
		if 'deal_overrides' in attrs or 'operating_hour_overrides' in attrs:
			(
				attrs['deal_overrides'],
				attrs['operating_hour_overrides'],
				normalized_offer_entries,
				normalized_hour_entries,
			) = _normalize_business_profile_override_payload(
				attrs.get('deal_overrides', []),
				attrs.get('operating_hour_overrides', []),
			)
			attrs['offer_entries_text'] = '\n'.join(normalized_offer_entries)
			attrs['hours_of_operation_entries_text'] = '\n'.join(normalized_hour_entries)
		if 'social_media_links_text' in attrs:
			_validate_profile_list_limits(_normalize_string_list(attrs['social_media_links_text']), 'social_media_links', MAX_SOCIAL_LINKS)
		if 'photo_references_text' in attrs:
			photo_references = _normalize_string_list(attrs['photo_references_text'])
			_validate_profile_list_limits(photo_references, 'photo_references', MAX_PROFILE_PHOTOS)
			_validate_https_reference_list(photo_references, 'photo_references')
		return attrs


class BusinessLocationTrackingPreferenceSerializer(serializers.Serializer):
	enabled = serializers.BooleanField()


class ContactSupportSerializer(serializers.Serializer):
	subject = serializers.CharField(max_length=160, required=False, allow_blank=True)
	message = serializers.CharField(max_length=4000)
	portal = serializers.ChoiceField(choices=['customer', 'business'], required=False, allow_blank=True)

	def validate_subject(self, value):
		return value.strip()

	def validate_message(self, value):
		normalized = value.strip()
		if not normalized:
			raise serializers.ValidationError('Enter a message for support.')
		return normalized


class WebsiteContactSerializer(serializers.Serializer):
	name = serializers.CharField(max_length=160)
	email = serializers.EmailField(max_length=254)
	subject = serializers.CharField(max_length=160)
	message = serializers.CharField(max_length=4000)
	turnstile_token = serializers.CharField(max_length=4096)

	def validate_name(self, value):
		normalized = value.strip()
		if not normalized or '\r' in normalized or '\n' in normalized:
			raise serializers.ValidationError('Enter a valid name.')
		return normalized

	def validate_email(self, value):
		return value.strip()

	def validate_subject(self, value):
		normalized = value.strip()
		if not normalized or '\r' in normalized or '\n' in normalized:
			raise serializers.ValidationError('Enter a valid subject.')
		return normalized

	def validate_message(self, value):
		normalized = value.strip()
		if not normalized:
			raise serializers.ValidationError('Enter a message for support.')
		return normalized


class ContentReportSerializer(serializers.Serializer):
	target_type = serializers.ChoiceField(choices=ContentReport.TargetType.values)
	listing_slug = serializers.SlugField(max_length=170, required=False, allow_blank=True)
	post_id = serializers.IntegerField(required=False, min_value=1)
	message_id = serializers.IntegerField(required=False, min_value=1)
	business_name = serializers.CharField(max_length=160, required=False, allow_blank=True)
	reason = serializers.ChoiceField(choices=ContentReport.Reason.values)
	details = serializers.CharField(max_length=4000, required=False, allow_blank=True)
	screenshot = serializers.ImageField(required=False, allow_null=True, write_only=True)

	def validate_listing_slug(self, value):
		return value.strip().lower()

	def validate_business_name(self, value):
		return value.strip()

	def validate_details(self, value):
		return value.strip()

	def validate_screenshot(self, value):
		if value is not None:
			try:
				moderate_uploaded_image(value, surface='content_report_screenshot')
			except (ImageModerationRejected, ImageModerationUnavailable) as error:
				raise serializers.ValidationError(str(error))
		return value


class FavoriteBusinessToggleSerializer(serializers.Serializer):
	slug = serializers.SlugField(max_length=170)
	location_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)
	favorited = serializers.BooleanField()
	portal = serializers.ChoiceField(choices=['customer', 'business'], required=False, allow_blank=True)

	def validate_slug(self, value):
		normalized = value.strip()
		if not normalized:
			raise serializers.ValidationError('Select a business to favorite.')
		return normalized


class CustomerPreferenceBusinessSerializer(serializers.Serializer):
	slug = serializers.SlugField(max_length=170)
	location_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)
	profile_updates_enabled = serializers.BooleanField(default=False)
	happy_hour_notifications_enabled = serializers.BooleanField(default=False)
	deal_updates_enabled = serializers.BooleanField(default=False)
	direct_message_notifications_enabled = serializers.BooleanField(default=False)


class CustomerPreferencesSerializer(serializers.Serializer):
	action = serializers.ChoiceField(choices=['complete', 'skip', 'save'], default='save')
	preferred_cities = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	preferred_days = serializers.ListField(child=serializers.IntegerField(min_value=0, max_value=6), required=False, allow_empty=True)
	preferred_time_periods = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	notifications_paused = serializers.BooleanField(required=False)
	direct_message_notifications_enabled = serializers.BooleanField(required=False)
	business_updates_notifications_enabled = serializers.BooleanField(required=False)
	happy_hour_notifications_enabled = serializers.BooleanField(required=False)
	businesses = CustomerPreferenceBusinessSerializer(many=True, required=False)

	def validate_preferred_cities(self, value):
		allowed = {'ventura', 'oxnard', 'camarillo'}
		normalized = list(dict.fromkeys(str(city).strip().lower() for city in value if str(city).strip()))
		if any(city not in allowed for city in normalized):
			raise serializers.ValidationError('Choose Ventura, Oxnard, or Camarillo.')
		return normalized

	def validate_preferred_days(self, value):
		return sorted(set(value))

	def validate_preferred_time_periods(self, value):
		allowed = {'morning', 'afternoon', 'evening'}
		normalized = list(dict.fromkeys(str(period).strip().lower() for period in value if str(period).strip()))
		if any(period not in allowed for period in normalized):
			raise serializers.ValidationError('Choose morning, afternoon, or evening.')
		return normalized


class DirectMessageSendSerializer(serializers.Serializer):
	portal = serializers.ChoiceField(choices=['customer', 'business'], required=False, allow_blank=True)
	listing_slug = serializers.SlugField(max_length=170, required=False, allow_blank=True)
	thread_id = serializers.IntegerField(required=False, allow_null=True)
	message = serializers.CharField(max_length=4000, required=False, allow_blank=True)
	image = serializers.ImageField(required=False, allow_null=True)

	def validate_message(self, value):
		normalized = value.strip()
		moderation_error = get_content_moderation_error(normalized)
		if moderation_error:
			raise serializers.ValidationError(moderation_error)
		return normalized

	def validate(self, attrs):
		attrs = super().validate(attrs)
		has_listing_slug = bool(str(attrs.get('listing_slug') or '').strip())
		has_thread_id = attrs.get('thread_id') is not None
		if has_listing_slug == has_thread_id:
			raise serializers.ValidationError('Provide either listing_slug or thread_id to send a direct message.')
		return attrs


class DirectMessageThreadListSerializer(serializers.Serializer):
	id = serializers.IntegerField()
	business_slug = serializers.SlugField()
	business_name = serializers.CharField()
	customer_username = serializers.CharField()
	last_message_at = serializers.DateTimeField()
	last_message_preview = serializers.CharField()
	unread_count = serializers.IntegerField()
	read_only = serializers.BooleanField(required=False, default=False)
	read_only_reason = serializers.CharField(required=False, allow_blank=True, default='')
	blocked = serializers.BooleanField(required=False, default=False)
	blocked_by_current_user = serializers.BooleanField(required=False, default=False)
	blocked_by_other_user = serializers.BooleanField(required=False, default=False)
	block_id = serializers.IntegerField(required=False, allow_null=True, default=None)


class DirectMessageItemSerializer(serializers.Serializer):
	id = serializers.IntegerField()
	sender_id = serializers.IntegerField()
	sender_username = serializers.CharField()
	message = serializers.CharField()
	message_type = serializers.ChoiceField(choices=['text', 'image'])
	image_url = serializers.CharField(allow_blank=True)
	image_expired = serializers.BooleanField(required=False, default=False)
	created_at = serializers.DateTimeField()
	read_at = serializers.DateTimeField(allow_null=True)


class DirectMessageBlockSerializer(serializers.Serializer):
	portal = serializers.ChoiceField(choices=['customer', 'business'], required=False, allow_blank=True)
	customer_username = serializers.CharField(max_length=150, required=False, allow_blank=True)
	thread_id = serializers.IntegerField(required=False, min_value=1)

	def validate_customer_username(self, value):
		normalized = value.strip()
		if not normalized:
			raise serializers.ValidationError('Enter the username you want to block from direct messaging.')
		return normalized

	def validate(self, attrs):
		if attrs.get('thread_id') is None and not str(attrs.get('customer_username') or '').strip():
			raise serializers.ValidationError('Provide a direct message thread or customer username to block.')
		return attrs


class PushDeviceRegistrationSerializer(serializers.Serializer):
	installation_id = serializers.CharField(max_length=80)
	push_token = serializers.CharField(max_length=255)
	platform = serializers.ChoiceField(choices=['ios', 'android'])
	portal = serializers.ChoiceField(choices=['customer', 'business'], required=False, allow_blank=True)

	def validate_installation_id(self, value):
		normalized = value.strip()
		if not normalized:
			raise serializers.ValidationError('Missing device installation id.')
		return normalized

	def validate_push_token(self, value):
		normalized = value.strip()
		if not normalized:
			raise serializers.ValidationError('Missing push token.')
		if not (normalized.startswith('ExponentPushToken[') or normalized.startswith('ExpoPushToken[')):
			raise serializers.ValidationError('Push token must be an Expo push token.')
		return normalized


class DeleteAccountSerializer(serializers.Serializer):
	password = serializers.CharField(write_only=True, style={'input_type': 'password'})

	def validate_password(self, value):
		request = self.context.get('request')
		user = getattr(request, 'user', None)
		if user is None or not getattr(user, 'is_authenticated', False) or not user.check_password(value):
			raise serializers.ValidationError('Incorrect password.')
		return value


class LoginSerializer(serializers.Serializer):
	portal = serializers.ChoiceField(choices=['customer', 'business'])
	identifier = serializers.CharField(max_length=150)
	password = serializers.CharField(write_only=True, style={'input_type': 'password'})
	two_factor_code = serializers.CharField(max_length=12, required=False, allow_blank=True, write_only=True)

	def validate(self, attrs):
		identifier = attrs['identifier'].strip()
		user = User.objects.filter(username__iexact=identifier).first()
		if user is None:
			raise serializers.ValidationError(GENERIC_AUTH_FAILURE_MESSAGE)

		authenticated_user = authenticate(username=user.username, password=attrs['password'])
		if authenticated_user is None:
			raise serializers.ValidationError(GENERIC_AUTH_FAILURE_MESSAGE)

		profile = get_or_create_account_profile(authenticated_user)
		if profile.business_claim_suspended:
			raise serializers.ValidationError(GENERIC_AUTH_FAILURE_MESSAGE)

		if attrs['portal'] == 'customer' and has_active_business_membership(authenticated_user):
			raise serializers.ValidationError(GENERIC_AUTH_FAILURE_MESSAGE)

		if attrs['portal'] == 'business':
			if has_active_business_membership(authenticated_user) or get_approved_business_claims(authenticated_user):
				pass
			elif authenticated_user.business_claims.exists() or authenticated_user.business_memberships.exists():
				raise serializers.ValidationError(GENERIC_AUTH_FAILURE_MESSAGE)
			else:
				raise serializers.ValidationError(GENERIC_AUTH_FAILURE_MESSAGE)
		if not profile.email_is_verified:
			attrs['user'] = authenticated_user
			attrs['email_verification_required'] = True
			return attrs

		if profile.two_factor_enabled:
			code = attrs.get('two_factor_code', '')
			if not code:
				raise serializers.ValidationError({'two_factor_code': ['Enter the 6-digit code from your authenticator app.']})
			if not profile.verify_two_factor_code(code):
				raise serializers.ValidationError({'two_factor_code': ['The authenticator code is invalid or expired.']})

		attrs['user'] = authenticated_user
		return attrs


class EmailVerificationCodeSerializer(serializers.Serializer):
	username = serializers.CharField(max_length=150)
	code = serializers.CharField(max_length=12, write_only=True)
	portal = serializers.ChoiceField(choices=['customer', 'business'], required=False, allow_blank=True)

	def validate_username(self, value):
		normalized = value.strip()
		if not normalized:
			raise serializers.ValidationError('Enter your username.')
		return normalized

	def validate_code(self, value):
		normalized = ''.join(character for character in str(value or '') if character.isdigit())
		if len(normalized) != 6:
			raise serializers.ValidationError('Enter the 6-digit verification code.')
		return normalized


class ResendEmailVerificationCodeSerializer(serializers.Serializer):
	username = serializers.CharField(max_length=150)
	portal = serializers.ChoiceField(choices=['customer', 'business'], required=False, allow_blank=True)

	def validate_username(self, value):
		normalized = value.strip()
		if not normalized:
			raise serializers.ValidationError('Enter your username.')
		return normalized


class UsernameReminderSerializer(serializers.Serializer):
	email = serializers.EmailField()

	def validate_email(self, value):
		return value.strip().lower()


class PasswordResetRequestSerializer(serializers.Serializer):
	identifier = serializers.CharField(max_length=150)

	def validate_identifier(self, value):
		return value.strip()


class BusinessClaimRetryRequestSerializer(serializers.Serializer):
	email = serializers.EmailField()

	def validate_email(self, value):
		return value.strip().lower()


class BusinessClaimRetryCodeVerifySerializer(serializers.Serializer):
	email = serializers.EmailField()
	code = serializers.CharField(max_length=6, min_length=6)

	def validate_email(self, value):
		return value.strip().lower()

	def validate_code(self, value):
		normalized = ''.join(character for character in str(value or '') if character.isdigit())
		if len(normalized) != 6:
			raise serializers.ValidationError('Enter the 6-digit verification code.')
		return normalized


class PasswordResetConfirmSerializer(serializers.Serializer):
	token = serializers.CharField(max_length=128)
	new_password = serializers.CharField(min_length=8, write_only=True, style={'input_type': 'password'})

	def validate(self, attrs):
		from .models import AccountProfile

		try:
			selector = str(attrs['token']).split('.', 1)[0]
		except (AttributeError, IndexError):
			selector = ''
		profile = AccountProfile.objects.select_related('user').filter(password_reset_selector=selector).first()
		if profile is None or not profile.password_reset_token_is_active(attrs['token']):
			raise serializers.ValidationError({'token': ['That password reset link is invalid or expired.']})

		try:
			validate_password(attrs['new_password'], user=profile.user)
		except DjangoValidationError as error:
			raise serializers.ValidationError({'new_password': list(error.messages)})

		attrs['profile'] = profile
		return attrs


class TwoFactorCodeSerializer(serializers.Serializer):
	code = serializers.CharField(max_length=12)
	portal = serializers.ChoiceField(choices=['customer', 'business'], required=False)

	def validate_code(self, value):
		normalized = ''.join(character for character in str(value or '') if character.isdigit())
		if len(normalized) != 6:
			raise serializers.ValidationError('Enter a valid 6-digit authenticator code.')
		return normalized


class CustomerSignupSerializer(serializers.Serializer):
	username = serializers.CharField(max_length=150)
	email = serializers.EmailField()
	password = serializers.CharField(min_length=8, write_only=True, style={'input_type': 'password'})
	first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
	last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
	terms_accepted = serializers.BooleanField(required=False, default=False, write_only=True)
	retry_token = serializers.CharField(max_length=128, required=False, allow_blank=True, write_only=True)

	def allows_rejected_business_reregistration(self):
		return False

	def validate_username(self, value):
		return value.strip()

	def validate_email(self, value):
		return value.strip().lower()

	def _get_existing_user_by_username(self, username):
		return User.objects.filter(username__iexact=str(username or '').strip()).first()

	def _get_existing_user_by_email(self, email):
		return User.objects.filter(email__iexact=str(email or '').strip().lower()).first()

	def _can_reuse_existing_business_user(self, user):
		if user is None or not self.allows_rejected_business_reregistration():
			return False
		if user.business_memberships.filter(is_active=True).exists():
			return False
		latest_claim = user.business_claims.order_by('-created_at').first()
		return latest_claim is not None and latest_claim.status == BusinessClaim.Status.REJECTED

	def _can_upgrade_authenticated_existing_user(self, user):
		request = self.context.get('request')
		request_user = getattr(request, 'user', None)
		if user is None or request_user is None or not getattr(request_user, 'is_authenticated', False):
			return False
		if request_user.pk != user.pk:
			return False
		return not user.business_memberships.filter(is_active=True).exists()

	def validate(self, attrs):
		attrs = super().validate(attrs)
		for field_name in ('social_profiles', 'deal_overrides', 'operating_hour_overrides', 'verification_documents'):
			if field_name in attrs:
				_validate_structured_value(attrs[field_name], field_name)
		for field_name, max_count in (
			('social_media_links', MAX_SOCIAL_LINKS),
			('offer_entries', MAX_DEALS),
			('hours_of_operation_entries', MAX_OPERATING_HOUR_WINDOWS),
			('photo_references', MAX_PROFILE_PHOTOS),
		):
			if field_name in attrs:
				_validate_profile_list_limits(attrs[field_name], field_name, max_count)
		if 'photo_references' in attrs:
			_validate_https_reference_list(attrs['photo_references'], 'photo_references')
		existing_username_user = self._get_existing_user_by_username(attrs.get('username'))
		existing_email_user = self._get_existing_user_by_email(attrs.get('email'))

		retry_token = str(attrs.get('retry_token') or '').strip()
		if retry_token:
			if not self.allows_rejected_business_reregistration():
				raise serializers.ValidationError({'retry_token': ['This link can only be used to retry a rejected business claim.']})
			if existing_email_user is None or existing_email_user.email.casefold() != str(attrs.get('email') or '').casefold():
				raise serializers.ValidationError({'retry_token': ['Authenticate with the original account owner before retrying this business claim.']})
			grant = _get_valid_business_retry_grant(existing_email_user, retry_token)
			if grant is None:
				raise serializers.ValidationError({'retry_token': ['This business claim retry link is invalid or expired.']})
			if existing_username_user is not None and existing_username_user.pk != existing_email_user.pk:
				raise serializers.ValidationError({'username': ['That username is already in use.']})
			attrs['_retry_grant'] = grant
			attrs['_retry_token'] = retry_token
			attrs['_signup_existing_user'] = existing_email_user
			return attrs

		if existing_username_user and existing_email_user and existing_username_user.pk != existing_email_user.pk:
			raise serializers.ValidationError({
				'username': ['That username is already in use.'],
				'email': ['That email is already in use.'],
			})

		existing_user = existing_username_user or existing_email_user
		if existing_user is None:
			return attrs

		if self._can_upgrade_authenticated_existing_user(existing_user):
			attrs['_signup_existing_user'] = existing_user
			return attrs

		errors = {}
		if existing_username_user is not None:
			errors['username'] = ['That username is already in use.']
		if existing_email_user is not None:
			errors['email'] = ['That email is already in use.']
		raise serializers.ValidationError(errors)

	def create_or_reuse_user(self, validated_data):
		terms_accepted = bool(validated_data.pop('terms_accepted', False))
		validated_data.pop('retry_token', None)
		retry_grant = validated_data.pop('_retry_grant', None)
		retry_token = validated_data.pop('_retry_token', '')
		password = validated_data.pop('password')
		existing_user = validated_data.pop('_signup_existing_user', None)
		if existing_user is None:
			user = User.objects.create_user(password=password, **validated_data)
			user._signup_reused_existing_user = False
		else:
			for field_name, value in validated_data.items():
				setattr(existing_user, field_name, value)
			existing_user.set_password(password)
			existing_user.save(update_fields=['username', 'email', 'first_name', 'last_name', 'password'])
			existing_user._signup_reused_existing_user = True
			user = existing_user

		user._business_claim_retry_grant = retry_grant
		user._business_claim_retry_token = retry_token
		user._business_claim_retry_of = getattr(retry_grant, 'rejected_claim', None)

		if terms_accepted:
			profile = get_or_create_account_profile(user)
			profile.terms_accepted_at = timezone.now()
			profile.terms_accepted_version = TERMS_OF_SERVICE_VERSION
			profile.save(update_fields=['terms_accepted_at', 'terms_accepted_version', 'updated_at'])
		return user

	def create(self, validated_data):
		user = self.create_or_reuse_user(validated_data)
		get_or_create_account_profile(user)
		return user


class ClaimedBusinessSignupSerializer(CustomerSignupSerializer):
	business_slug = serializers.SlugField(write_only=True)
	contact_name = serializers.CharField(max_length=120)
	job_title = serializers.ChoiceField(choices=BusinessClaim.JobTitle.choices)
	work_email = serializers.EmailField()
	work_phone = serializers.CharField(max_length=20)
	employer_address = serializers.CharField(max_length=255)
	address_not_applicable = serializers.BooleanField(default=False)
	business_website_url = serializers.URLField(required=False, allow_blank=True)
	social_profiles = serializers.JSONField(required=False)
	deal_overrides = serializers.JSONField(required=False)
	operating_hour_overrides = serializers.JSONField(required=False)
	social_media_links = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	offer_entries = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	hours_of_operation_entries = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	photo_references = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	verification_documents = serializers.JSONField(required=False)
	verification_data_consent = serializers.BooleanField(required=True)
	supporting_details = serializers.CharField(max_length=4000, required=False, allow_blank=True)

	def allows_rejected_business_reregistration(self):
		return True

	def validate(self, attrs):
		attrs = super().validate(attrs)
		_require_verification_data_consent(attrs)
		if attrs.get('address_not_applicable'):
			raise serializers.ValidationError({'address_not_applicable': ['Address Not Applicable is only available when you create a new business profile.']})
		attrs['social_media_links'] = _normalize_string_list(attrs.get('social_media_links', []))
		attrs['social_profiles'], attrs['business_website_url'], attrs['social_media_links'] = _normalize_social_profile_payload(
			attrs.get('social_profiles', {}),
			business_website_url=attrs.get('business_website_url', ''),
			social_media_links=attrs['social_media_links'],
		)
		if 'deal_overrides' in attrs or 'operating_hour_overrides' in attrs:
			attrs['deal_overrides'], attrs['operating_hour_overrides'], attrs['offer_entries'], attrs['hours_of_operation_entries'] = _normalize_business_profile_override_payload(
				attrs.get('deal_overrides', []),
				attrs.get('operating_hour_overrides', []),
			)
		else:
			attrs['offer_entries'] = _normalize_string_list(attrs.get('offer_entries', []))
			attrs['hours_of_operation_entries'] = _normalize_string_list(attrs.get('hours_of_operation_entries', []))
		attrs['photo_references'] = _normalize_string_list(attrs.get('photo_references', []))
		_validate_https_reference_list(attrs['photo_references'], 'photo_references')
		attrs['verification_documents'] = _normalize_document_map(attrs.get('verification_documents', {}))
		return attrs

	def create(self, validated_data):
		request = self.context.get('request')
		pending_claim_attachments = _prepare_claim_attachments(request)
		verification_data_consent_fields = _pop_verification_data_consent(validated_data)
		listing_snapshot = validated_data.pop('listing_snapshot')
		validated_data.pop('business_slug', None)
		business_website_url = validated_data.pop('business_website_url', '')
		claim_data = {
			'pathway': BusinessClaim.Pathway.CLAIMED,
			'contact_name': validated_data.pop('contact_name'),
			'job_title': validated_data.pop('job_title'),
			'work_email': validated_data.pop('work_email'),
			'work_phone': validated_data.pop('work_phone'),
			'employer_address': validated_data.pop('employer_address'),
			'address_not_applicable': validated_data.pop('address_not_applicable', False),
			'business_website_url': business_website_url,
			'social_profiles': validated_data.pop('social_profiles', {}),
			'social_media_links': validated_data.pop('social_media_links', []),
			'deal_overrides': validated_data.pop('deal_overrides', None),
			'operating_hour_overrides': validated_data.pop('operating_hour_overrides', None),
			'offer_entries': validated_data.pop('offer_entries', []),
			'hours_of_operation_entries': validated_data.pop('hours_of_operation_entries', []),
			'photo_references': validated_data.pop('photo_references', []),
			'verification_documents': validated_data.pop('verification_documents', {}),
			**verification_data_consent_fields,
			'verification_summary': 'Submitted through the claimed business verification flow.',
			'supporting_details': validated_data.pop('supporting_details', ''),
		}
		with transaction.atomic():
			user = self.create_or_reuse_user(validated_data)
			claim = BusinessClaim.objects.create(
				claimant=user,
				listing_snapshot=listing_snapshot,
				status=BusinessClaim.Status.DRAFT,
				retry_of=getattr(user, '_business_claim_retry_of', None),
				**claim_data,
			)
			_validate_claim_media_ownership(claim, claim.deal_overrides, claim.photo_references)
			claim.deal_overrides = merge_uploaded_deal_attachments(request, claim, claim.deal_overrides or [])
			claim.save(update_fields=['deal_overrides', 'updated_at'])
			_create_claim_profile_entries(claim, claim_data)
			_create_claim_attachments(claim, request, pending_claim_attachments)
			_append_uploaded_profile_photos_to_claim(request, claim)
			try:
				claim.submit_for_review()
			except DjangoValidationError as error:
				raise serializers.ValidationError(list(error.messages))
			_consume_business_retry_grant(user, getattr(user, '_business_claim_retry_grant', None), getattr(user, '_business_claim_retry_token', ''))
			send_business_claim_submission_support_email_safely(claim)
			user._created_business_claim = claim
			return user


class EstablishedBusinessSignupSerializer(CustomerSignupSerializer):
	business_name = serializers.CharField(max_length=150)
	business_city = serializers.CharField(max_length=40)
	business_venue_type = serializers.ChoiceField(choices=VenueType.choices)
	business_website_url = serializers.URLField()
	contact_name = serializers.CharField(max_length=120)
	job_title = serializers.ChoiceField(choices=BusinessClaim.JobTitle.choices)
	work_email = serializers.EmailField()
	work_phone = serializers.CharField(max_length=20)
	employer_address = serializers.CharField(max_length=255, required=False, allow_blank=True)
	address_not_applicable = serializers.BooleanField(default=False)
	social_profiles = serializers.JSONField(required=False)
	deal_overrides = serializers.JSONField(required=False)
	operating_hour_overrides = serializers.JSONField(required=False)
	social_media_links = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	offer_entries = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	hours_of_operation_entries = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	photo_references = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	verification_documents = serializers.JSONField(required=False)
	verification_data_consent = serializers.BooleanField(required=True)
	supporting_details = serializers.CharField(max_length=4000, required=False, allow_blank=True)

	def allows_rejected_business_reregistration(self):
		return True

	def validate_business_city(self, value):
		normalized = str(value or '').strip().lower()
		if normalized in City.values or normalized == BusinessClaim.MULTIPLE_AREAS_VALUE:
			return normalized
		raise serializers.ValidationError('Select a supported city or Serves Multiple Locations / Service Area Business.')

	def validate(self, attrs):
		attrs = super().validate(attrs)
		_require_verification_data_consent(attrs)
		serves_multiple_areas = attrs.get('business_city') == BusinessClaim.MULTIPLE_AREAS_VALUE
		attrs['serves_multiple_areas'] = serves_multiple_areas
		if serves_multiple_areas and not attrs.get('employer_address'):
			attrs['address_not_applicable'] = True
		if serves_multiple_areas:
			attrs['business_city'] = ''
		if not attrs.get('address_not_applicable') and not attrs.get('employer_address'):
			raise serializers.ValidationError({'employer_address': ['Employer address is required unless you mark Address Not Applicable.']})
		attrs['social_media_links'] = _normalize_string_list(attrs.get('social_media_links', []))
		attrs['social_profiles'], attrs['business_website_url'], attrs['social_media_links'] = _normalize_social_profile_payload(
			attrs.get('social_profiles', {}),
			business_website_url=attrs.get('business_website_url', ''),
			social_media_links=attrs['social_media_links'],
		)
		if 'deal_overrides' in attrs or 'operating_hour_overrides' in attrs:
			attrs['deal_overrides'], attrs['operating_hour_overrides'], attrs['offer_entries'], attrs['hours_of_operation_entries'] = _normalize_business_profile_override_payload(
				attrs.get('deal_overrides', []),
				attrs.get('operating_hour_overrides', []),
			)
		else:
			attrs['offer_entries'] = _normalize_string_list(attrs.get('offer_entries', []))
			attrs['hours_of_operation_entries'] = _normalize_string_list(attrs.get('hours_of_operation_entries', []))
		attrs['photo_references'] = _normalize_string_list(attrs.get('photo_references', []))
		_validate_https_reference_list(attrs['photo_references'], 'photo_references')
		attrs['verification_documents'] = _normalize_document_map(attrs.get('verification_documents', {}))
		return attrs

	def create(self, validated_data):
		request = self.context.get('request')
		pending_claim_attachments = _prepare_claim_attachments(request)
		verification_data_consent_fields = _pop_verification_data_consent(validated_data)
		business_venue_type = validated_data.pop('business_venue_type')
		serves_multiple_areas = validated_data.pop('serves_multiple_areas', False)
		listing_address = validated_data.get('employer_address') or ('Approximate live location' if serves_multiple_areas else 'Address Not Applicable')
		listing_snapshot = ListingSnapshot.objects.create(
			name=validated_data.pop('business_name'),
			city=validated_data.pop('business_city', ''),
			venue_type=business_venue_type,
			address_line_1=listing_address,
			serves_multiple_areas=serves_multiple_areas,
			website_url=validated_data.pop('business_website_url', ''),
			source_name=BusinessClaim.MANUAL_SOURCE_NAME,
			external_id=f'user-{slugify(validated_data.get("username", "business")).replace("_", "-")}',
		)

		claim_data = {
			'pathway': BusinessClaim.Pathway.ESTABLISHED,
			'contact_name': validated_data.pop('contact_name'),
			'job_title': validated_data.pop('job_title'),
			'work_email': validated_data.pop('work_email'),
			'work_phone': validated_data.pop('work_phone'),
			'employer_address': validated_data.pop('employer_address', ''),
			'address_not_applicable': validated_data.pop('address_not_applicable', False),
			'serves_multiple_areas': serves_multiple_areas,
			'business_website_url': listing_snapshot.website_url,
			'social_profiles': validated_data.pop('social_profiles', {}),
			'social_media_links': validated_data.pop('social_media_links', []),
			'deal_overrides': validated_data.pop('deal_overrides', None),
			'operating_hour_overrides': validated_data.pop('operating_hour_overrides', None),
			'offer_entries': validated_data.pop('offer_entries', []),
			'hours_of_operation_entries': validated_data.pop('hours_of_operation_entries', []),
			'photo_references': validated_data.pop('photo_references', []),
			'verification_documents': validated_data.pop('verification_documents', {}),
			**verification_data_consent_fields,
			'verification_summary': 'Submitted through the established business creation flow.',
			'supporting_details': validated_data.pop('supporting_details', ''),
		}
		with transaction.atomic():
			user = self.create_or_reuse_user(validated_data)
			claim = BusinessClaim.objects.create(
				claimant=user,
				listing_snapshot=listing_snapshot,
				status=BusinessClaim.Status.DRAFT,
				retry_of=getattr(user, '_business_claim_retry_of', None),
				**claim_data,
			)
			_validate_claim_media_ownership(claim, claim.deal_overrides, claim.photo_references)
			claim.deal_overrides = merge_uploaded_deal_attachments(request, claim, claim.deal_overrides or [])
			claim.save(update_fields=['deal_overrides', 'updated_at'])
			_create_claim_profile_entries(claim, claim_data)
			_create_claim_attachments(claim, request, pending_claim_attachments)
			_append_uploaded_profile_photos_to_claim(request, claim)
			try:
				claim.submit_for_review()
			except DjangoValidationError as error:
				raise serializers.ValidationError(list(error.messages))
			_consume_business_retry_grant(user, getattr(user, '_business_claim_retry_grant', None), getattr(user, '_business_claim_retry_token', ''))
			send_business_claim_submission_support_email_safely(claim)
			user._created_business_claim = claim
			return user


class InformalBusinessSignupSerializer(CustomerSignupSerializer):
	business_name = serializers.CharField(max_length=150)
	business_city = serializers.CharField(max_length=40)
	business_venue_type = serializers.ChoiceField(choices=VenueType.choices)
	business_website_url = serializers.URLField(required=False, allow_blank=True)
	employer_address = serializers.CharField(max_length=255, required=False, allow_blank=True)
	social_profiles = serializers.JSONField(required=False)
	deal_overrides = serializers.JSONField(required=False)
	operating_hour_overrides = serializers.JSONField(required=False)
	social_media_links = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	offer_entries = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	hours_of_operation_entries = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	photo_references = serializers.ListField(child=serializers.CharField(), required=False, allow_empty=True)
	verification_data_consent = serializers.BooleanField(required=True)
	supporting_details = serializers.CharField(max_length=4000, required=False, allow_blank=True)

	def allows_rejected_business_reregistration(self):
		return True

	def validate_business_city(self, value):
		normalized = str(value or '').strip().lower()
		if normalized in City.values or normalized == BusinessClaim.MULTIPLE_AREAS_VALUE:
			return normalized
		raise serializers.ValidationError('Select a supported city or Serves Multiple Locations / Service Area Business.')

	def validate(self, attrs):
		attrs = super().validate(attrs)
		_require_verification_data_consent(attrs)
		attrs['serves_multiple_areas'] = attrs.get('business_city') == BusinessClaim.MULTIPLE_AREAS_VALUE
		if attrs['serves_multiple_areas']:
			attrs['business_city'] = ''
		attrs['social_media_links'] = _normalize_string_list(attrs.get('social_media_links', []))
		attrs['social_profiles'], attrs['business_website_url'], attrs['social_media_links'] = _normalize_social_profile_payload(
			attrs.get('social_profiles', {}),
			business_website_url=attrs.get('business_website_url', ''),
			social_media_links=attrs['social_media_links'],
		)
		if 'deal_overrides' in attrs or 'operating_hour_overrides' in attrs:
			attrs['deal_overrides'], attrs['operating_hour_overrides'], attrs['offer_entries'], attrs['hours_of_operation_entries'] = _normalize_business_profile_override_payload(
				attrs.get('deal_overrides', []),
				attrs.get('operating_hour_overrides', []),
			)
		else:
			attrs['offer_entries'] = _normalize_string_list(attrs.get('offer_entries', []))
			attrs['hours_of_operation_entries'] = _normalize_string_list(attrs.get('hours_of_operation_entries', []))
		attrs['photo_references'] = _normalize_string_list(attrs.get('photo_references', []))
		_validate_https_reference_list(attrs['photo_references'], 'photo_references')
		return attrs

	def create(self, validated_data):
		request = self.context.get('request')
		pending_claim_attachments = _prepare_claim_attachments(request)
		verification_data_consent_fields = _pop_verification_data_consent(validated_data)
		serves_multiple_areas = validated_data.pop('serves_multiple_areas', False)
		social_media_links = validated_data.pop('social_media_links', [])
		social_profiles = validated_data.pop('social_profiles', {})
		deal_overrides = validated_data.pop('deal_overrides', None)
		operating_hour_overrides = validated_data.pop('operating_hour_overrides', None)
		offer_entries = validated_data.pop('offer_entries', [])
		hours_of_operation_entries = validated_data.pop('hours_of_operation_entries', [])
		photo_references = validated_data.pop('photo_references', [])
		employer_address = validated_data.pop('employer_address', '')
		supporting_details = validated_data.pop('supporting_details', '')
		listing_snapshot = ListingSnapshot.objects.create(
			name=validated_data.pop('business_name'),
			city=validated_data.pop('business_city', ''),
			venue_type=validated_data.pop('business_venue_type'),
			address_line_1=employer_address or ('Approximate live location' if serves_multiple_areas else 'Address not yet provided'),
			serves_multiple_areas=serves_multiple_areas,
			website_url=validated_data.pop('business_website_url', ''),
			source_name=BusinessClaim.MANUAL_SOURCE_NAME,
			external_id=f'informal-{slugify(validated_data.get("username", "business"))}',
		)

		with transaction.atomic():
			user = self.create_or_reuse_user(validated_data)
			claim = BusinessClaim.objects.create(
				claimant=user,
				listing_snapshot=listing_snapshot,
				pathway=BusinessClaim.Pathway.INFORMAL,
				status=BusinessClaim.Status.DRAFT,
				retry_of=getattr(user, '_business_claim_retry_of', None),
				contact_name=' '.join(part for part in [user.first_name, user.last_name] if part).strip() or user.username,
				work_email=user.email,
				employer_address=employer_address,
				address_not_applicable=serves_multiple_areas and not employer_address,
				serves_multiple_areas=serves_multiple_areas,
				business_website_url=listing_snapshot.website_url,
				social_profiles=social_profiles,
				social_media_links=social_media_links,
				deal_overrides=deal_overrides,
				operating_hour_overrides=operating_hour_overrides,
				offer_entries=offer_entries,
				hours_of_operation_entries=hours_of_operation_entries,
				photo_references=photo_references,
				**verification_data_consent_fields,
				verification_summary='Submitted through the small startup and vendor flow.',
				supporting_details=supporting_details,
			)
			_validate_claim_media_ownership(claim, claim.deal_overrides, claim.photo_references)
			claim.deal_overrides = merge_uploaded_deal_attachments(request, claim, claim.deal_overrides or [])
			claim.save(update_fields=['deal_overrides', 'updated_at'])
			_create_claim_profile_entries(
				claim,
				{
					'social_media_links': social_media_links,
					'offer_entries': offer_entries,
					'hours_of_operation_entries': hours_of_operation_entries,
					'photo_references': photo_references,
				},
			)
			_create_claim_attachments(claim, request, pending_claim_attachments)
			_append_uploaded_profile_photos_to_claim(request, claim)
			try:
				claim.submit_for_review()
			except DjangoValidationError as error:
				raise serializers.ValidationError(list(error.messages))
			_consume_business_retry_grant(user, getattr(user, '_business_claim_retry_grant', None), getattr(user, '_business_claim_retry_token', ''))
			send_business_claim_submission_support_email_safely(claim)
			user._created_business_claim = claim
			return user


ManualBusinessSignupSerializer = EstablishedBusinessSignupSerializer


class BusinessLocationUpdateSerializer(serializers.Serializer):
	latitude = serializers.FloatField(min_value=-90, max_value=90)
	longitude = serializers.FloatField(min_value=-180, max_value=180)
	accuracy_meters = serializers.FloatField(required=False, allow_null=True, min_value=0)
	address_line_1 = serializers.CharField(max_length=255, required=False, allow_blank=True)
	city_label = serializers.CharField(max_length=120, required=False, allow_blank=True)


def sync_listing_snapshot_from_place_payload(payload):
	primary_location = (payload.get('locations') or [payload])[0]
	city = str(primary_location.get('city') or payload.get('city') or '').strip().lower()
	venue_type = str(primary_location.get('venue_type') or payload.get('venue_type') or '').strip().lower()
	listing_slug = str(payload.get('slug', '') or '').strip()
	website_url = primary_location.get('website_url', '') or payload.get('website_url', '')
	address_line_1 = primary_location.get('address_line_1', '') or payload.get('address_line_1', '')

	defaults = {
		'name': payload.get('name', ''),
		'city': city if city in City.values else '',
		'venue_type': venue_type if venue_type in VenueType.values else '',
		'address_line_1': primary_location.get('address_line_1', '') or payload.get('address_line_1', ''),
		'address_line_2': primary_location.get('address_line_2', '') or payload.get('address_line_2', ''),
		'neighborhood': primary_location.get('neighborhood', '') or payload.get('neighborhood', ''),
		'state': primary_location.get('state', '') or payload.get('state', '') or 'CA',
		'postal_code': primary_location.get('postal_code', '') or payload.get('postal_code', ''),
		'phone_number': primary_location.get('phone_number', '') or payload.get('phone_number', ''),
		'website_url': website_url,
		'source_name': 'business_websites',
		'source_url': website_url,
		'external_id': listing_slug,
		'listing_slug': listing_slug,
	}

	snapshot = None
	if listing_slug:
		snapshot = ListingSnapshot.objects.filter(listing_slug=listing_slug).order_by('-updated_at', '-captured_at').first()

	if snapshot is None:
		candidate_queryset = ListingSnapshot.objects.filter(name__iexact=defaults['name'])
		if defaults['city']:
			candidate_queryset = candidate_queryset.filter(city=defaults['city'])
		website_identity = _normalize_url_identity(website_url)
		for candidate in candidate_queryset.order_by('-updated_at', '-captured_at'):
			if website_identity and _normalize_url_identity(candidate.website_url) == website_identity:
				snapshot = candidate
				break
			if address_line_1 and str(candidate.address_line_1 or '').strip().lower() == str(address_line_1).strip().lower():
				snapshot = candidate
				break

	if snapshot is not None:
		for field_name, value in defaults.items():
			setattr(snapshot, field_name, value)
		snapshot.save(update_fields=[
			'name',
			'city',
			'venue_type',
			'address_line_1',
			'address_line_2',
			'neighborhood',
			'state',
			'postal_code',
			'phone_number',
			'website_url',
			'source_name',
			'source_url',
			'external_id',
			'listing_slug',
			'updated_at',
		])
		return snapshot

	snapshot, _ = ListingSnapshot.objects.update_or_create(
		listing_slug=listing_slug,
		defaults=defaults,
	)
	return snapshot


class HappyHourSerializer(serializers.Serializer):
	id = serializers.IntegerField()
	weekday = serializers.IntegerField()
	weekday_label = serializers.CharField()
	start_time = serializers.CharField()
	end_time = serializers.CharField()
	all_day = serializers.BooleanField()


class OperatingHourSerializer(serializers.Serializer):
	id = serializers.IntegerField()
	weekday = serializers.IntegerField()
	weekday_label = serializers.CharField()
	open_time = serializers.CharField()
	close_time = serializers.CharField()


class DealSerializer(serializers.Serializer):
	id = serializers.IntegerField()
	title = serializers.CharField()
	description = serializers.CharField()
	deal_type = serializers.CharField()
	deal_type_label = serializers.CharField()
	custom_deal_type_label = serializers.CharField(required=False, allow_blank=True)
	price_text = serializers.CharField()
	terms = serializers.CharField()
	attachment = serializers.DictField(required=False, allow_null=True)
	is_active = serializers.BooleanField()
	starts_on = serializers.CharField(allow_null=True)
	ends_on = serializers.CharField(allow_null=True)
	happy_hours = HappyHourSerializer(many=True)


class FeedItemSerializer(serializers.Serializer):
	id = serializers.CharField()
	item_type = serializers.CharField()
	is_sponsored = serializers.BooleanField()
	post_id = serializers.IntegerField()
	campaign_id = serializers.IntegerField(required=False, allow_null=True)
	business_name = serializers.CharField()
	business_slug = serializers.CharField()
	city = serializers.CharField(allow_blank=True)
	city_label = serializers.CharField(allow_blank=True)
	venue_type = serializers.CharField(allow_blank=True)
	venue_type_label = serializers.CharField(allow_blank=True)
	title = serializers.CharField()
	summary = serializers.CharField(allow_blank=True)
	body = serializers.CharField(allow_blank=True)
	hero_image_url = serializers.CharField(allow_blank=True)
	cta_label = serializers.CharField(allow_blank=True)
	cta_url = serializers.CharField(allow_blank=True)
	published_at = serializers.DateTimeField(allow_null=True)
	starts_at = serializers.DateTimeField(allow_null=True)
	ends_at = serializers.DateTimeField(allow_null=True)
	sponsor_label = serializers.CharField(allow_blank=True)


class FeedImpressionWriteSerializer(serializers.ModelSerializer):
	class Meta:
		model = FeedImpression
		fields = ['feed_item_id', 'post', 'campaign', 'placement_type', 'session_key', 'request_id', 'page_number', 'position']

	def validate(self, attrs):
		campaign = attrs.get('campaign')
		post = attrs.get('post')
		placement_type = attrs.get('placement_type')
		if campaign is not None and campaign.post_id != post.id:
			raise serializers.ValidationError('Campaign and post must refer to the same promoted content.')
		if placement_type == FeedImpression.PlacementType.SPONSORED and campaign is None:
			raise serializers.ValidationError('Sponsored impressions require a campaign.')
		if placement_type == FeedImpression.PlacementType.ORGANIC and campaign is not None:
			raise serializers.ValidationError('Organic impressions cannot attach a campaign.')
		return attrs


class FeedEngagementWriteSerializer(serializers.ModelSerializer):
	class Meta:
		model = FeedEngagement
		fields = ['feed_item_id', 'post', 'campaign', 'impression', 'event_type', 'session_key', 'destination_url', 'page_number', 'position']

	def validate(self, attrs):
		campaign = attrs.get('campaign')
		post = attrs.get('post')
		impression = attrs.get('impression')
		if campaign is not None and campaign.post_id != post.id:
			raise serializers.ValidationError('Campaign and post must refer to the same promoted content.')
		if impression is not None:
			if impression.post_id != post.id:
				raise serializers.ValidationError('Impression and post must refer to the same content.')
			if campaign is not None and impression.campaign_id != campaign.id:
				raise serializers.ValidationError('Impression and campaign must refer to the same promoted content.')
		return attrs


class PlaceLocationSerializer(serializers.Serializer):
	id = serializers.IntegerField()
	slug = serializers.CharField()
	name = serializers.CharField()
	is_starred = serializers.BooleanField(required=False, default=False)
	city = serializers.CharField()
	city_label = serializers.CharField()
	venue_type = serializers.CharField()
	venue_type_label = serializers.CharField()
	address_line_1 = serializers.CharField()
	address_line_2 = serializers.CharField()
	neighborhood = serializers.CharField()
	state = serializers.CharField()
	postal_code = serializers.CharField()
	latitude = serializers.FloatField(allow_null=True)
	longitude = serializers.FloatField(allow_null=True)
	live_location_updated_at = serializers.DateTimeField(allow_null=True, required=False, default=None)
	phone_number = serializers.CharField()
	website_url = serializers.CharField()
	image_urls = serializers.ListField(child=serializers.CharField(), required=False, default=list)
	operating_hours = OperatingHourSerializer(many=True, required=False, default=list)
	is_active = serializers.BooleanField()
	has_deals = serializers.BooleanField(required=False, default=False)
	deal_count = serializers.IntegerField(required=False, default=0)
	operating_weekdays = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
	deal_weekdays = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
	is_verified = serializers.BooleanField(required=False, default=False)


class PlaceLocationDetailSerializer(PlaceLocationSerializer):
	deals = DealSerializer(many=True)


class LiveLocationPlaceSerializer(serializers.Serializer):
	slug = serializers.SlugField()
	latitude = serializers.FloatField(allow_null=True)
	longitude = serializers.FloatField(allow_null=True)
	updated_at = serializers.DateTimeField(allow_null=True)
	tracking_enabled = serializers.BooleanField(required=False, default=True)
	place_removed = serializers.BooleanField(required=False, default=False)
	address_line_1 = serializers.CharField(required=False, allow_blank=True, default='')
	city_label = serializers.CharField(required=False, allow_blank=True, default='')


class CurrentHappyHourWindowSerializer(serializers.Serializer):
	deal_id = serializers.IntegerField(allow_null=True)
	title = serializers.CharField()
	price_text = serializers.CharField(allow_blank=True)
	weekday_label = serializers.CharField(allow_blank=True)
	start_time = serializers.CharField(allow_blank=True)
	end_time = serializers.CharField(allow_blank=True)
	all_day = serializers.BooleanField()


class CurrentHappyHourPlaceSerializer(serializers.Serializer):
	slug = serializers.SlugField()
	location_id = serializers.IntegerField()
	name = serializers.CharField()
	city = serializers.CharField(allow_blank=True)
	city_label = serializers.CharField(allow_blank=True)
	venue_type_label = serializers.CharField(allow_blank=True)
	address_line_1 = serializers.CharField(allow_blank=True)
	address_line_2 = serializers.CharField(allow_blank=True)
	latitude = serializers.FloatField(allow_null=True)
	longitude = serializers.FloatField(allow_null=True)
	image_urls = serializers.ListField(child=serializers.CharField(), required=False, default=list)
	happy_hours = CurrentHappyHourWindowSerializer(many=True)


class CurrentHappyHoursResponseSerializer(serializers.Serializer):
	observed_at = serializers.DateTimeField()
	places = CurrentHappyHourPlaceSerializer(many=True)


class PlaceListSerializer(serializers.Serializer):
	id = serializers.IntegerField()
	name = serializers.CharField()
	slug = serializers.CharField()
	is_starred = serializers.BooleanField(required=False, default=False)
	is_claimed = serializers.BooleanField(required=False, default=False)
	is_informal = serializers.BooleanField(required=False, default=False)
	direct_messaging_enabled = serializers.BooleanField(required=False, default=False)
	direct_message_restricted = serializers.BooleanField(required=False, default=False)
	can_direct_message = serializers.BooleanField(required=False, default=False)
	social_profiles = serializers.DictField(required=False, default=dict)
	deal_overrides = serializers.ListField(child=serializers.DictField(), required=False, allow_null=True)
	operating_hour_overrides = serializers.ListField(child=serializers.DictField(), required=False, allow_null=True)
	social_media_links = serializers.ListField(child=serializers.CharField(), required=False, default=list)
	offer_entries = serializers.ListField(child=serializers.CharField(), required=False, default=list)
	hours_of_operation_entries = serializers.ListField(child=serializers.CharField(), required=False, default=list)
	photo_references = serializers.ListField(child=serializers.CharField(), required=False, default=list)
	supporting_details = serializers.CharField(required=False, allow_blank=True, default='')
	city = serializers.CharField()
	city_label = serializers.CharField()
	venue_type = serializers.CharField()
	venue_type_label = serializers.CharField()
	address_line_1 = serializers.CharField()
	address_line_2 = serializers.CharField()
	neighborhood = serializers.CharField()
	state = serializers.CharField()
	postal_code = serializers.CharField()
	latitude = serializers.FloatField(allow_null=True)
	longitude = serializers.FloatField(allow_null=True)
	live_location_updated_at = serializers.DateTimeField(allow_null=True, required=False, default=None)
	phone_number = serializers.CharField()
	website_url = serializers.CharField()
	image_urls = serializers.ListField(child=serializers.CharField(), required=False, default=list)
	is_active = serializers.BooleanField()
	has_deals = serializers.BooleanField(required=False, default=False)
	deal_count = serializers.IntegerField(required=False, default=0)
	operating_weekdays = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
	deal_weekdays = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
	is_verified = serializers.BooleanField(required=False, default=False)
	locations = PlaceLocationSerializer(many=True, required=False, default=list)


class PlaceDetailSerializer(PlaceListSerializer):
	deals = DealSerializer(many=True)
	locations = PlaceLocationDetailSerializer(many=True, required=False, default=list)
