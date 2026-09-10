from types import SimpleNamespace
from unittest.mock import Mock, patch

import requests
from django.contrib.admin.sites import AdminSite
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils.datastructures import MultiValueDict

from .admin import BusinessClaimAttachmentInline
from .models import BusinessClaimAttachment, _extract_text_from_pdf_bytes
from .serializers import _create_claim_attachments, _prepare_claim_attachments
from .services.cloudmersive_scanning import ScanStatus, scan_pdf_file


def request_with_claim_files(*uploaded_files, field_name='proof_of_authority_attachments'):
	return SimpleNamespace(FILES=MultiValueDict({field_name: list(uploaded_files)}))


def clean_scan_response():
	response = Mock()
	response.json.return_value = {
		'CleanResult': True,
		'FoundViruses': [],
		'VerifiedFileFormat': 'PDF',
	}
	return response


class CloudmersiveScanServiceTests(TestCase):
	@override_settings(
		CLOUDMERSIVE_VIRUS_SCAN_API_KEY='test-api-key',
		CLOUDMERSIVE_VIRUS_SCAN_BASE_URL='https://scanner.example.test',
		CLOUDMERSIVE_VIRUS_SCAN_TIMEOUT_SECONDS=15,
	)
	@patch('places.services.cloudmersive_scanning.requests.post')
	def test_clean_pdf_uses_advanced_scan_request_contract(self, mock_post):
		mock_post.return_value = clean_scan_response()
		uploaded_file = SimpleUploadedFile('proof.pdf', b'%PDF-1.7 test', content_type='application/pdf')

		result = scan_pdf_file(uploaded_file)

		self.assertEqual(result.status, ScanStatus.CLEAN)
		mock_post.assert_called_once()
		args, kwargs = mock_post.call_args
		self.assertEqual(args[0], 'https://scanner.example.test/virus/scan/file/advanced')
		self.assertEqual(kwargs['timeout'], 15)
		self.assertEqual(kwargs['headers']['Apikey'], 'test-api-key')
		self.assertEqual(kwargs['headers']['fileName'], 'proof.pdf')
		self.assertEqual(kwargs['headers']['restrictFileTypes'], '.pdf')
		for option in (
			'allowExecutables',
			'allowInvalidFiles',
			'allowScripts',
			'allowPasswordProtectedFiles',
			'allowMacros',
			'allowXmlExternalEntities',
			'allowInsecureDeserialization',
			'allowHtml',
			'allowUnsafeArchives',
			'allowOleEmbeddedObject',
			'allowUnwantedAction',
		):
			self.assertEqual(kwargs['headers'][option], 'false')
		multipart_value = kwargs['files']['inputFile']
		self.assertEqual(multipart_value[0], 'proof.pdf')
		self.assertIs(multipart_value[1], uploaded_file)
		self.assertEqual(multipart_value[2], 'application/pdf')
		self.assertEqual(uploaded_file.tell(), 0)

	@override_settings(CLOUDMERSIVE_VIRUS_SCAN_API_KEY='test-api-key')
	@patch('places.services.cloudmersive_scanning.requests.post')
	def test_non_clean_or_unverified_pdf_is_rejected(self, mock_post):
		response = Mock()
		response.json.return_value = {
			'CleanResult': True,
			'ContainsScript': True,
			'VerifiedFileFormat': 'PDF',
		}
		mock_post.return_value = response

		result = scan_pdf_file(SimpleUploadedFile('unsafe.pdf', b'%PDF-unsafe', content_type='application/pdf'))

		self.assertEqual(result.status, ScanStatus.REJECTED)
		self.assertEqual(result.reason, 'script_content')

	@override_settings(CLOUDMERSIVE_VIRUS_SCAN_API_KEY='test-api-key')
	@patch('places.services.cloudmersive_scanning.requests.post')
	def test_provider_failures_are_unavailable_without_retrying(self, mock_post):
		failure_cases = (
			(requests.Timeout('timed out'), 'request_failed'),
			(requests.HTTPError('401'), 'request_failed'),
			(requests.HTTPError('429'), 'request_failed'),
			(requests.HTTPError('500'), 'request_failed'),
		)
		for error, reason in failure_cases:
			with self.subTest(error=type(error).__name__):
				mock_post.reset_mock()
				response = Mock()
				response.raise_for_status.side_effect = error
				mock_post.return_value = response
				result = scan_pdf_file(SimpleUploadedFile('proof.pdf', b'%PDF-test', content_type='application/pdf'))
				self.assertEqual(result.status, ScanStatus.UNAVAILABLE)
				self.assertEqual(result.reason, reason)
				mock_post.assert_called_once()

		mock_post.reset_mock()
		mock_post.side_effect = requests.ConnectionError('offline')
		result = scan_pdf_file(SimpleUploadedFile('proof.pdf', b'%PDF-test', content_type='application/pdf'))
		self.assertEqual(result.status, ScanStatus.UNAVAILABLE)
		mock_post.assert_called_once()

	@override_settings(CLOUDMERSIVE_VIRUS_SCAN_API_KEY='test-api-key')
	@patch('places.services.cloudmersive_scanning.requests.post')
	def test_malformed_provider_response_is_unavailable(self, mock_post):
		response = Mock()
		response.json.return_value = {'CleanResult': True, 'VerifiedFileFormat': ['PDF']}
		mock_post.return_value = response

		result = scan_pdf_file(SimpleUploadedFile('proof.pdf', b'%PDF-test', content_type='application/pdf'))

		self.assertEqual(result.status, ScanStatus.UNAVAILABLE)
		self.assertEqual(result.reason, 'invalid_verified_file_format')

	@override_settings(CLOUDMERSIVE_VIRUS_SCAN_API_KEY='')
	@patch('places.services.cloudmersive_scanning.requests.post')
	def test_missing_api_key_does_not_make_a_provider_call(self, mock_post):
		result = scan_pdf_file(SimpleUploadedFile('proof.pdf', b'%PDF-test', content_type='application/pdf'))

		self.assertEqual(result.status, ScanStatus.UNAVAILABLE)
		self.assertEqual(result.reason, 'missing_api_key')
		mock_post.assert_not_called()


class ClaimAttachmentScanBoundaryTests(TestCase):
	@override_settings(CLOUDMERSIVE_VIRUS_SCAN_FAILURE_MODE='allow')
	@patch('places.serializers.scan_pdf_file', return_value=type('Result', (), {'status': ScanStatus.UNAVAILABLE, 'reason': 'quota_exhausted'})())
	def test_fail_open_marks_pdf_provider_unavailable(self, mock_scan):
		uploaded_file = SimpleUploadedFile('authority.pdf', b'%PDF-test', content_type='application/pdf')

		pending = _prepare_claim_attachments(request_with_claim_files(uploaded_file))

		self.assertEqual(len(pending), 1)
		self.assertEqual(
			pending[0]['malware_scan_status'],
			BusinessClaimAttachment.MalwareScanStatus.PROVIDER_UNAVAILABLE,
		)
		self.assertEqual(pending[0]['malware_scan_reason'], 'quota_exhausted')
		self.assertIsNotNone(pending[0]['malware_scan_attempted_at'])
		mock_scan.assert_called_once_with(uploaded_file)

	@override_settings(CLOUDMERSIVE_VIRUS_SCAN_FAILURE_MODE='block')
	@patch('places.serializers.scan_pdf_file', return_value=type('Result', (), {'status': ScanStatus.UNAVAILABLE, 'reason': 'timeout'})())
	def test_fail_closed_rejects_provider_unavailable_pdf(self, mock_scan):
		from rest_framework.exceptions import ValidationError

		with self.assertRaises(ValidationError):
			_prepare_claim_attachments(request_with_claim_files(SimpleUploadedFile('authority.pdf', b'%PDF-test', content_type='application/pdf')))
		mock_scan.assert_called_once()

	@patch('places.serializers.scan_pdf_file', return_value=type('Result', (), {'status': ScanStatus.CLEAN, 'reason': ''})())
	def test_all_pdfs_are_scanned_before_any_attachment_storage(self, mock_scan):
		first_file = SimpleUploadedFile('first.pdf', b'%PDF-first', content_type='application/pdf')
		second_file = SimpleUploadedFile('second.pdf', b'%PDF-second', content_type='application/pdf')
		events = []

		def scan_and_record(uploaded_file):
			events.append(('scan', uploaded_file.name))
			return mock_scan.return_value

		def create_and_record(**kwargs):
			events.append(('store', kwargs['original_filename']))
			return Mock()

		with patch('places.serializers.scan_pdf_file', side_effect=scan_and_record):
			pending = _prepare_claim_attachments(request_with_claim_files(first_file, second_file))
			with patch('places.serializers.BusinessClaimAttachment.objects.create', side_effect=create_and_record):
				_create_claim_attachments(Mock(), request_with_claim_files(first_file, second_file), pending)

		self.assertEqual(
			events,
			[
				('scan', 'first.pdf'),
				('scan', 'second.pdf'),
				('store', 'first.pdf'),
				('store', 'second.pdf'),
			],
		)

	@patch('places.serializers.scan_pdf_file')
	def test_rejected_pdf_is_not_sent_to_storage(self, mock_scan):
		mock_scan.return_value = type('Result', (), {'status': ScanStatus.REJECTED, 'reason': 'virus_detected'})()
		create_mock = Mock()

		from rest_framework.exceptions import ValidationError
		with patch('places.serializers.BusinessClaimAttachment.objects.create', create_mock):
			with self.assertRaises(ValidationError):
				_prepare_claim_attachments(request_with_claim_files(SimpleUploadedFile('bad.pdf', b'%PDF-bad', content_type='application/pdf')))

		create_mock.assert_not_called()

	@patch('places.serializers.scan_pdf_file')
	def test_images_skip_cloudmersive_and_non_media_claim_files_are_rejected(self, mock_scan):
		image = SimpleUploadedFile('storefront.png', b'\x89PNG\r\n\x1a\nvalid', content_type='image/png')
		pending = _prepare_claim_attachments(request_with_claim_files(image))
		self.assertEqual(pending[0]['malware_scan_status'], BusinessClaimAttachment.MalwareScanStatus.NOT_APPLICABLE)
		mock_scan.assert_not_called()

		from rest_framework.exceptions import ValidationError
		with self.assertRaises(ValidationError):
			_prepare_claim_attachments(request_with_claim_files(SimpleUploadedFile('notes.txt', b'not media', content_type='text/plain')))

	@patch('places.serializers.scan_pdf_file')
	def test_claim_image_requires_a_matching_file_signature(self, mock_scan):
		from rest_framework.exceptions import ValidationError

		with self.assertRaises(ValidationError):
			_prepare_claim_attachments(request_with_claim_files(SimpleUploadedFile('fake.png', b'not an image', content_type='image/png')))
		mock_scan.assert_not_called()


class ClaimPdfParserSafetyTests(TestCase):
	def test_only_clean_pdfs_reach_local_text_analysis(self):
		legacy_attachment = BusinessClaimAttachment(
			original_filename='legacy.pdf',
			content_type='application/pdf',
			malware_scan_status=BusinessClaimAttachment.MalwareScanStatus.LEGACY_UNSCANNED,
		)
		clean_attachment = BusinessClaimAttachment(
			original_filename='clean.pdf',
			content_type='application/pdf',
			malware_scan_status=BusinessClaimAttachment.MalwareScanStatus.CLEAN,
		)

		with patch.object(legacy_attachment, 'read_file_bytes') as legacy_read, patch('places.models._extract_attachment_validation_text') as extract_text:
			analysis = legacy_attachment.get_document_validation_analysis()
			self.assertTrue(analysis['scan_unavailable'])
			legacy_read.assert_not_called()
			extract_text.assert_not_called()

		with patch.object(clean_attachment, 'read_file_bytes', return_value=b'%PDF-clean'), patch('places.models._extract_attachment_validation_text', return_value='manager authorization') as extract_text:
			analysis = clean_attachment.get_document_validation_analysis()
			self.assertFalse(analysis['scan_unavailable'])
			extract_text.assert_called_once()

	@override_settings(VERIFICATION_PDF_MAX_PAGES=1, VERIFICATION_PDF_MAX_EXTRACTED_TEXT_BYTES=5)
	@patch('places.models.PdfReader')
	def test_pdf_text_extraction_is_bounded(self, mock_pdf_reader):
		first_page = Mock()
		first_page.extract_text.return_value = 'abcdefghij'
		second_page = Mock()
		second_page.extract_text.return_value = 'should not be read'
		mock_pdf_reader.return_value.pages = [first_page, second_page]

		text = _extract_text_from_pdf_bytes(b'%PDF-test')

		self.assertEqual(text, 'abcde')
		first_page.extract_text.assert_called_once()
		second_page.extract_text.assert_not_called()


class ClaimAttachmentAdminSafetyTests(TestCase):
	def test_unscanned_pdf_shows_warning_without_embedded_preview(self):
		attachment = BusinessClaimAttachment(
			original_filename='outage-proof.pdf',
			content_type='application/pdf',
			malware_scan_status=BusinessClaimAttachment.MalwareScanStatus.PROVIDER_UNAVAILABLE,
		)
		attachment.file = SimpleNamespace(url='/private-media/outage-proof.pdf')
		inline = BusinessClaimAttachmentInline(BusinessClaimAttachment, AdminSite())

		preview = str(inline.file_preview(attachment))

		self.assertIn('Security scan warning', preview)
		self.assertIn('Open/download after manual review', preview)
		self.assertNotIn('<iframe', preview)
