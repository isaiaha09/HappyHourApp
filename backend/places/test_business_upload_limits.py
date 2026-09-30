from io import BytesIO
from types import SimpleNamespace

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.exceptions import TooManyFilesSent
from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, override_settings
from django.test.client import encode_multipart
from django.urls import path

from .upload_limits import BusinessUploadLimitsMiddleware, BusinessUploadRequestTooBig


def multipart_parse_probe(request):
	request.POST
	return HttpResponse('parsed')


urlpatterns = [
	path('api/profiles/manual-business-signup/', multipart_parse_probe),
	path('api/profiles/content-reports/', multipart_parse_probe),
]


class BusinessUploadLimitsMiddlewareTests(SimpleTestCase):
	def setUp(self):
		self.factory = RequestFactory()

	@override_settings(BUSINESS_UPLOAD_MAX_REQUEST_BYTES=16)
	def test_declared_oversized_business_upload_is_rejected_before_body_read(self):
		request = self.factory.generic(
			'POST',
			'/api/profiles/business-signup/',
			data=b'x' * 17,
			content_type='multipart/form-data; boundary=test-boundary',
		)
		called = []
		middleware = BusinessUploadLimitsMiddleware(lambda _request: called.append(True) or HttpResponse('ok'))

		response = middleware(request)

		self.assertEqual(response.status_code, 413)
		self.assertEqual(called, [])
		self.assertEqual(request._stream._pos, 0)

	@override_settings(BUSINESS_UPLOAD_MAX_REQUEST_BYTES=8)
	def test_stream_guard_rejects_over_limit_body_even_without_declared_length(self):
		request = SimpleNamespace(
			method='POST',
			path_info='/api/profiles/manual-business-signup/',
			content_type='multipart/form-data',
			META={'CONTENT_LENGTH': ''},
			_stream=BytesIO(b'0123456789'),
			upload_handlers=[],
			_read_started=False,
		)
		middleware = BusinessUploadLimitsMiddleware(lambda guarded_request: guarded_request._stream.read())

		with self.assertRaises(BusinessUploadRequestTooBig) as raised:
			middleware(request)

		response = middleware.process_exception(request, raised.exception)

		self.assertEqual(response.status_code, 413)

	@override_settings(BUSINESS_UPLOAD_MAX_REQUEST_BYTES=16)
	def test_upload_within_limit_passes_through_and_is_readable(self):
		request = self.factory.generic(
			'POST',
			'/api/profiles/informal-business-signup/',
			data=b'valid-small-body',
			content_type='multipart/form-data; boundary=test-boundary',
		)
		middleware = BusinessUploadLimitsMiddleware(lambda guarded_request: HttpResponse(guarded_request.read()))

		response = middleware(request)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.content, b'valid-small-body')

	@override_settings(BUSINESS_UPLOAD_MAX_REQUEST_BYTES=8)
	def test_non_business_upload_route_is_not_affected(self):
		request = self.factory.generic(
			'POST',
			'/api/profiles/content-reports/',
			data=b'0123456789',
			content_type='multipart/form-data; boundary=test-boundary',
		)
		middleware = BusinessUploadLimitsMiddleware(lambda _request: HttpResponse('handled'))

		response = middleware(request)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.content, b'handled')


class BusinessUploadFileCountTests(SimpleTestCase):
	def setUp(self):
		self.factory = RequestFactory()

	@override_settings(
		ROOT_URLCONF='places.test_business_upload_limits',
		BUSINESS_UPLOAD_MAX_REQUEST_BYTES=1024 * 1024,
		BUSINESS_UPLOAD_MAX_FILE_COUNT=1,
	)
	def test_middleware_returns_413_for_too_many_file_parts_before_view_body_logic(self):
		response = self.client.post(
			'/api/profiles/manual-business-signup/',
			{
				'attachments': [
					SimpleUploadedFile('first.pdf', b'%PDF-1.7', content_type='application/pdf'),
					SimpleUploadedFile('second.pdf', b'%PDF-1.7', content_type='application/pdf'),
				],
			},
		)

		self.assertEqual(response.status_code, 413)
		self.assertIn('no more than 1 file', response.json()['detail'])

	@override_settings(
		ROOT_URLCONF='places.test_business_upload_limits',
		BUSINESS_UPLOAD_MAX_REQUEST_BYTES=1024 * 1024,
		BUSINESS_UPLOAD_MAX_FILE_COUNT=48,
	)
	def test_file_parts_at_configured_limit_are_still_accepted(self):
		response = self.client.post(
			'/api/profiles/manual-business-signup/',
			{
				'attachments': [
					SimpleUploadedFile(f'document-{index}.pdf', b'', content_type='application/pdf')
					for index in range(48)
				],
			},
		)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.content, b'parsed')

	@override_settings(
		ROOT_URLCONF='places.test_business_upload_limits',
		BUSINESS_UPLOAD_MAX_REQUEST_BYTES=1024 * 1024,
		BUSINESS_UPLOAD_MAX_FILE_COUNT=1,
		DATA_UPLOAD_MAX_NUMBER_FILES=100,
	)
	def test_unrelated_multipart_route_keeps_its_existing_file_count_limit(self):
		response = self.client.post(
			'/api/profiles/content-reports/',
			{
				'attachments': [
					SimpleUploadedFile('first.png', b'first', content_type='image/png'),
					SimpleUploadedFile('second.png', b'second', content_type='image/png'),
				],
			},
		)

		self.assertEqual(response.status_code, 200)
		self.assertEqual(response.content, b'parsed')

	@override_settings(
		BUSINESS_UPLOAD_MAX_REQUEST_BYTES=1024 * 1024,
		BUSINESS_UPLOAD_MAX_FILE_COUNT=1,
		DATA_UPLOAD_MAX_NUMBER_FILES=1,
	)
	def test_excess_file_parts_are_rejected_during_parse_before_view_continues(self):
		boundary = 'business-upload-test-boundary'
		body = encode_multipart(
			boundary,
			{
				'business_registration_attachments': [
					SimpleUploadedFile('first.pdf', b'%PDF-1.7', content_type='application/pdf'),
					SimpleUploadedFile('second.pdf', b'%PDF-1.7', content_type='application/pdf'),
				],
			},
		)
		request = self.factory.generic(
			'POST',
			'/api/profiles/manual-business-signup/',
			data=body,
			content_type=f'multipart/form-data; boundary={boundary}',
		)
		view_continued = []

		def parse_then_continue(guarded_request):
			guarded_request.parse_file_upload(guarded_request.META, guarded_request)
			view_continued.append(True)
			return HttpResponse('parsed')

		middleware = BusinessUploadLimitsMiddleware(parse_then_continue)

		with self.assertRaises(TooManyFilesSent) as raised:
			middleware(request)

		response = middleware.process_exception(request, raised.exception)

		self.assertEqual(response.status_code, 413)
		self.assertEqual(view_continued, [])
