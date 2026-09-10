from dataclasses import dataclass
import logging
from pathlib import Path

import requests
from django.conf import settings


LOGGER = logging.getLogger(__name__)
ADVANCED_SCAN_PATH = '/virus/scan/file/advanced'


class ScanStatus:
	CLEAN = 'clean'
	REJECTED = 'rejected'
	UNAVAILABLE = 'unavailable'


@dataclass(frozen=True)
class CloudmersiveScanResult:
	status: str
	reason: str = ''


_BLOCKING_RESULT_FLAGS = (
	('ContainsExecutable', 'executable_content'),
	('ContainsInvalidFile', 'invalid_file'),
	('ContainsScript', 'script_content'),
	('ContainsPasswordProtectedFile', 'password_protected_file'),
	('ContainsRestrictedFileFormat', 'restricted_file_format'),
	('ContainsMacros', 'macro_content'),
	('ContainsXmlExternalEntities', 'xml_external_entities'),
	('ContainsInsecureDeserialization', 'insecure_deserialization'),
	('ContainsHtml', 'html_content'),
	('ContainsUnsafeArchive', 'unsafe_archive'),
	('ContainsOleEmbeddedObject', 'ole_embedded_object'),
	('ContainsUnwantedAction', 'unwanted_action'),
)


def _safe_file_name(uploaded_file):
	raw_file_name = str(getattr(uploaded_file, 'name', '') or 'verification.pdf').replace('\\', '/')
	file_name = Path(raw_file_name).name
	file_name = file_name.replace('\r', '').replace('\n', '').strip()
	return file_name[:255] or 'verification.pdf'


def _unavailable(reason, error=None):
	if error is None:
		LOGGER.error('Cloudmersive PDF scan unavailable: %s', reason, extra={'cloudmersive_scan_status': ScanStatus.UNAVAILABLE})
	else:
		LOGGER.error(
			'Cloudmersive PDF scan unavailable: %s',
			reason,
			extra={'cloudmersive_scan_status': ScanStatus.UNAVAILABLE},
			exc_info=error,
		)
	return CloudmersiveScanResult(ScanStatus.UNAVAILABLE, reason)


def _rejected(reason):
	LOGGER.info(
		'Cloudmersive PDF scan rejected a verification upload: %s',
		reason,
		extra={'cloudmersive_scan_status': ScanStatus.REJECTED},
	)
	return CloudmersiveScanResult(ScanStatus.REJECTED, reason)


def _clean_result(payload):
	if not isinstance(payload, dict):
		return _unavailable('invalid_response_payload')

	clean_result = payload.get('CleanResult')
	if clean_result is not True:
		if clean_result is False:
			return _rejected('not_clean')
		return _unavailable('missing_clean_result')

	for flag_name, reason in _BLOCKING_RESULT_FLAGS:
		flag_value = payload.get(flag_name)
		if flag_value is True:
			return _rejected(reason)
		if flag_value is not None and flag_value is not False:
			return _unavailable(f'invalid_{reason}_flag')

	found_viruses = payload.get('FoundViruses')
	if isinstance(found_viruses, list) and found_viruses:
		return _rejected('virus_detected')
	if found_viruses not in (None, []) and not isinstance(found_viruses, list):
		return _unavailable('invalid_virus_result')

	verified_format_value = payload.get('VerifiedFileFormat')
	if verified_format_value is None:
		return _unavailable('missing_verified_file_format')
	if not isinstance(verified_format_value, str):
		return _unavailable('invalid_verified_file_format')
	verified_format = verified_format_value.strip().lower().lstrip('.')
	if not verified_format:
		return _unavailable('missing_verified_file_format')
	if verified_format not in {'pdf', 'application/pdf'}:
		return _rejected('verified_format_not_pdf')

	return CloudmersiveScanResult(ScanStatus.CLEAN)


def scan_pdf_file(uploaded_file):
	api_key = str(getattr(settings, 'CLOUDMERSIVE_VIRUS_SCAN_API_KEY', '') or '').strip()
	if not api_key:
		return _unavailable('missing_api_key')

	base_url = str(getattr(settings, 'CLOUDMERSIVE_VIRUS_SCAN_BASE_URL', 'https://api.cloudmersive.com') or '').strip().rstrip('/')
	if not base_url:
		return _unavailable('missing_base_url')

	try:
		timeout_seconds = max(1, int(getattr(settings, 'CLOUDMERSIVE_VIRUS_SCAN_TIMEOUT_SECONDS', 15) or 15))
	except (TypeError, ValueError):
		timeout_seconds = 15

	file_name = _safe_file_name(uploaded_file)
	headers = {
		'Accept': 'application/json',
		'Apikey': api_key,
		'fileName': file_name,
		'allowExecutables': 'false',
		'allowInvalidFiles': 'false',
		'allowScripts': 'false',
		'allowPasswordProtectedFiles': 'false',
		'allowMacros': 'false',
		'allowXmlExternalEntities': 'false',
		'allowInsecureDeserialization': 'false',
		'allowHtml': 'false',
		'allowUnsafeArchives': 'false',
		'allowOleEmbeddedObject': 'false',
		'allowUnwantedAction': 'false',
		'restrictFileTypes': '.pdf',
	}

	try:
		uploaded_file.seek(0)
		response = requests.post(
			f'{base_url}{ADVANCED_SCAN_PATH}',
			headers=headers,
			files={'inputFile': (file_name, uploaded_file, 'application/pdf')},
			timeout=timeout_seconds,
		)
		response.raise_for_status()
		result = _clean_result(response.json())
		LOGGER.info(
			'Cloudmersive PDF scan call completed',
			extra={
				'cloudmersive_scan_status': result.status,
				'cloudmersive_scan_reason': result.reason,
			},
		)
		return result
	except (requests.RequestException, ValueError, TypeError, OSError) as error:
		return _unavailable('request_failed', error)
	finally:
		try:
			uploaded_file.seek(0)
		except (OSError, ValueError):
			pass
