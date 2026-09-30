from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.db import transaction
from django.http import HttpResponse
from django.test import RequestFactory, TestCase, override_settings

from .models import BusinessClaim, BusinessClaimAttachment, City, ListingSnapshot, ManagedMedia, VenueType
from .serializers import _create_claim_attachments
from .services.media_storage import save_managed_media
from .upload_limits import BusinessUploadLimitsMiddleware


User = get_user_model()


class FailedBusinessUploadCleanupTests(TestCase):
	def setUp(self):
		self.user = User.objects.create_user(
			username='upload_cleanup_owner',
			email='upload-cleanup@example.com',
			password='test-pass-123',
		)
		self.snapshot = ListingSnapshot.objects.create(
			name='Cleanup Test Business',
			city=City.VENTURA,
			venue_type=VenueType.CAFE,
			address_line_1='1 Main St',
		)
		self.claim = BusinessClaim.objects.create(
			claimant=self.user,
			listing_snapshot=self.snapshot,
		)
		self.factory = RequestFactory()

	@staticmethod
	def _storage_settings(root):
		root = Path(root)
		return {
			'default': {
				'BACKEND': 'django.core.files.storage.FileSystemStorage',
				'OPTIONS': {'location': str(root / 'public')},
			},
			'private_media': {
				'BACKEND': 'django.core.files.storage.FileSystemStorage',
				'OPTIONS': {'location': str(root / 'private')},
			},
			'direct_messages': {
				'BACKEND': 'django.core.files.storage.FileSystemStorage',
				'OPTIONS': {'location': str(root / 'private')},
			},
			'staticfiles': settings.STORAGES['staticfiles'],
		}

	def _multipart_request(self):
		return self.factory.generic(
			'POST',
			'/api/profiles/me/',
			data=b'--cleanup-boundary--\r\n',
			content_type='multipart/form-data; boundary=cleanup-boundary',
		)

	def test_failed_request_cleans_managed_media_written_before_database_rollback(self):
		with TemporaryDirectory() as temp_dir:
			with override_settings(STORAGES=self._storage_settings(temp_dir)):
				request = self._multipart_request()

				def reject_after_storage(request):
					with transaction.atomic():
						save_managed_media(
							self.claim,
							ContentFile(b'profile-photo-bytes', name='photo.png'),
							'businesses/test/profile-photos/request-photo.png',
							'profile_photo',
							request=request,
						)
						transaction.set_rollback(True)
					return HttpResponse(status=400)

				response = BusinessUploadLimitsMiddleware(reject_after_storage)(request)
				remaining_files = [path for path in Path(temp_dir).rglob('*') if path.is_file()]

		self.assertEqual(response.status_code, 400)
		self.assertEqual(ManagedMedia.objects.filter(claim=self.claim).count(), 0)
		self.assertEqual(remaining_files, [])

	def test_failed_managed_media_record_creation_cleans_the_completed_storage_write(self):
		with TemporaryDirectory() as temp_dir:
			with override_settings(STORAGES=self._storage_settings(temp_dir)):
				request = self._multipart_request()

				def fail_after_storage(request):
					with patch('places.models.ManagedMedia.objects.create', side_effect=RuntimeError('database write failed')):
						try:
							save_managed_media(
								self.claim,
								ContentFile(b'profile-photo-bytes', name='photo.png'),
								'businesses/test/profile-photos/database-error.png',
								'profile_photo',
								request=request,
							)
							raise AssertionError('The injected database failure was not triggered.')
						except RuntimeError:
							return HttpResponse(status=500)

				response = BusinessUploadLimitsMiddleware(fail_after_storage)(request)
				remaining_files = [path for path in Path(temp_dir).rglob('*') if path.is_file()]

		self.assertEqual(response.status_code, 500)
		self.assertEqual(ManagedMedia.objects.filter(claim=self.claim).count(), 0)
		self.assertEqual(remaining_files, [])

	def test_failed_request_cleans_private_verification_files_after_rollback(self):
		with TemporaryDirectory() as temp_dir:
			with override_settings(STORAGES=self._storage_settings(temp_dir)):
				request = self._multipart_request()
				pending = [{
					'attachment_kind': BusinessClaimAttachment.AttachmentKind.SOCIAL_MEDIA,
					'uploaded_file': ContentFile(b'proof-document-bytes', name='proof.pdf'),
					'original_filename': 'proof.pdf',
					'content_type': 'application/pdf',
					'file_size': 20,
					'malware_scan_status': BusinessClaimAttachment.MalwareScanStatus.CLEAN,
					'malware_scan_attempted_at': None,
					'malware_scan_provider': 'test',
					'malware_scan_reason': '',
				}]

				def reject_after_storage(request):
					with transaction.atomic():
						_create_claim_attachments(self.claim, request, pending)
						transaction.set_rollback(True)
					return HttpResponse(status=400)

				response = BusinessUploadLimitsMiddleware(reject_after_storage)(request)
				remaining_files = [path for path in Path(temp_dir).rglob('*') if path.is_file()]

		self.assertEqual(response.status_code, 400)
		self.assertEqual(BusinessClaimAttachment.objects.filter(claim=self.claim).count(), 0)
		self.assertEqual(remaining_files, [])

	def test_successful_request_keeps_new_media_and_its_reference(self):
		with TemporaryDirectory() as temp_dir:
			with override_settings(STORAGES=self._storage_settings(temp_dir)):
				request = self._multipart_request()
				created = {}

				def accept_upload(request):
					media, media_url = save_managed_media(
						self.claim,
						ContentFile(b'profile-photo-bytes', name='photo.png'),
						'businesses/test/profile-photos/successful-photo.png',
						'profile_photo',
						request=request,
					)
					self.claim.photo_references = [media_url]
					self.claim.save(update_fields=['photo_references', 'updated_at'])
					created['media'] = media
					return HttpResponse(status=201)

				response = BusinessUploadLimitsMiddleware(accept_upload)(request)
				stored_name = created['media'].storage_name
				file_exists = default_storage.exists(stored_name)

		self.assertEqual(response.status_code, 201)
		self.assertTrue(ManagedMedia.objects.filter(pk=created['media'].pk).exists())
		self.assertTrue(file_exists)
