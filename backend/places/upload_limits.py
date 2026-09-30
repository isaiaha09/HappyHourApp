import logging

from django.conf import settings
from django.core.exceptions import RequestDataTooBig, TooManyFilesSent
from django.core.files.uploadhandler import FileUploadHandler
from django.http import JsonResponse


logger = logging.getLogger(__name__)


BUSINESS_UPLOAD_PATHS = frozenset({
	'/api/profiles/business-signup',
	'/api/profiles/manual-business-signup',
	'/api/profiles/informal-business-signup',
	'/api/profiles/me',
})


class BusinessUploadRequestTooBig(RequestDataTooBig):
	"""Raised when a business multipart request exceeds its whole-body limit."""


class LimitedRequestBodyStream:
	"""Count bytes as Django reads the body, including streamed request bodies."""

	def __init__(self, stream, max_bytes):
		self.stream = stream
		self.max_bytes = max(1, int(max_bytes))
		self.bytes_read = 0

	def _read(self, reader, size):
		remaining_with_probe = self.max_bytes - self.bytes_read + 1
		read_size = remaining_with_probe if size is None or size < 0 else min(size, remaining_with_probe)
		chunk = reader(read_size)
		if chunk:
			if self.bytes_read + len(chunk) > self.max_bytes:
				raise BusinessUploadRequestTooBig('Business upload request exceeded its maximum size.')
			self.bytes_read += len(chunk)
		return chunk

	def read(self, size=-1):
		return self._read(self.stream.read, size)

	def readline(self, size=-1):
		return self._read(self.stream.readline, size)

	def __getattr__(self, name):
		return getattr(self.stream, name)


class BusinessUploadFileCountHandler(FileUploadHandler):
	"""Apply a bounded multipart file-part count only to business upload routes."""

	def __init__(self, request=None):
		super().__init__(request)
		self.file_count = 0

	def new_file(self, *args, **kwargs):
		self.file_count += 1
		max_files = max(1, int(getattr(settings, 'BUSINESS_UPLOAD_MAX_FILE_COUNT', 48)))
		if self.file_count > max_files:
			raise TooManyFilesSent('Business upload exceeded its maximum file count.')

	def receive_data_chunk(self, raw_data, start):
		return raw_data

	def file_complete(self, file_size):
		return None


class BusinessUploadLimitsMiddleware:
	"""Reject oversized business multipart uploads before parsing or scanning."""

	def __init__(self, get_response):
		self.get_response = get_response

	def __call__(self, request):
		if self._is_business_upload_request(request):
			request._business_upload_limits_active = True
			max_bytes = self._max_request_bytes()
			try:
				declared_bytes = int(request.META.get('CONTENT_LENGTH') or 0)
			except (TypeError, ValueError):
				declared_bytes = 0

			if declared_bytes > max_bytes:
				return self._too_large_response()

			stream = getattr(request, '_stream', None)
			if stream is not None and not getattr(request, '_read_started', False):
				request._stream = LimitedRequestBodyStream(stream, max_bytes)
				request.upload_handlers = [
					BusinessUploadFileCountHandler(request),
					*request.upload_handlers,
				]

		try:
			response = self.get_response(request)
		except Exception:
			self._cleanup_failed_stored_uploads(request)
			raise

		if getattr(request, '_business_upload_limits_active', False) and response.status_code >= 400:
			self._cleanup_failed_stored_uploads(request)
		return response

	@staticmethod
	def _cleanup_failed_stored_uploads(request):
		try:
			from .services.media_storage import cleanup_failed_business_uploads

			cleanup_failed_business_uploads(request)
		except Exception:
			logger.exception('Failed to clean stored objects from an unsuccessful business upload request.')

	def process_exception(self, request, exception):
		if not getattr(request, '_business_upload_limits_active', False):
			return None
		if isinstance(exception, (BusinessUploadRequestTooBig, TooManyFilesSent)):
			self._cleanup_interrupted_uploads(request)
			return self._too_large_response()
		return None

	@staticmethod
	def _cleanup_interrupted_uploads(request):
		for handler in getattr(request, '_upload_handlers', ()) or ():
			try:
				handler.upload_interrupted()
			except Exception:
				logger.exception('Failed to clean temporary files from a rejected business upload request.')

	@staticmethod
	def _is_business_upload_request(request):
		if request.method not in {'POST', 'PUT', 'PATCH'}:
			return False
		if str(getattr(request, 'content_type', '') or '').strip().lower() != 'multipart/form-data':
			return False
		path = str(getattr(request, 'path_info', '') or '').rstrip('/')
		return path in BUSINESS_UPLOAD_PATHS

	@staticmethod
	def _max_request_bytes():
		return max(1, int(getattr(settings, 'BUSINESS_UPLOAD_MAX_REQUEST_BYTES', 50 * 1024 * 1024)))

	@classmethod
	def _too_large_response(cls):
		max_megabytes = cls._max_request_bytes() / (1024 * 1024)
		max_files = max(1, int(getattr(settings, 'BUSINESS_UPLOAD_MAX_FILE_COUNT', 48)))
		file_label = 'file' if max_files == 1 else 'files'
		return JsonResponse(
			{'detail': f'Business uploads must be {max_megabytes:g} MB or smaller and may contain no more than {max_files} {file_label}.'},
			status=413,
		)
