import hashlib
import io
import logging
import threading

from django.conf import settings
from django.core.cache import caches
from PIL import Image, ImageOps


logger = logging.getLogger(__name__)

LOCAL_NUDENET_BLOCKED_CLASSES = frozenset({
	'ANUS_EXPOSED',
	'BUTTOCKS_EXPOSED',
	'FEMALE_BREAST_EXPOSED',
	'FEMALE_GENITALIA_EXPOSED',
	'MALE_GENITALIA_EXPOSED',
})

_detector = None
_detector_lock = threading.Lock()


class ImageModerationError(ValueError):
	pass


class ImageModerationRejected(ImageModerationError):
	pass


class ImageModerationUnavailable(ImageModerationError):
	pass


def moderate_uploaded_image(uploaded_file, surface='user_image'):
	provider = str(getattr(settings, 'IMAGE_MODERATION_PROVIDER', 'disabled') or '').strip().lower()
	if provider in {'', 'disabled', 'none', 'off'}:
		return
	if provider != 'local_nudenet':
		raise ImageModerationUnavailable('Local automated image screening is not configured for this environment.')

	raw_bytes = _read_uploaded_file(uploaded_file)
	digest = hashlib.sha256(raw_bytes).hexdigest()
	block_score = max(1, min(100, int(getattr(settings, 'IMAGE_MODERATION_BLOCK_SCORE_PERCENT', 65) or 65))) / 100
	cache_key = f'image-moderation:{provider}:{block_score:.2f}:{digest}'
	cache = caches[getattr(settings, 'IMAGE_MODERATION_CACHE_ALIAS', 'default')]
	try:
		cached_detections = cache.get(cache_key)
	except Exception:
		cached_detections = None

	if isinstance(cached_detections, list):
		_raise_if_blocked(cached_detections, block_score)
		return

	try:
		detections = _detect_with_local_model(_prepare_image_for_local_model(raw_bytes))
	except ImageModerationRejected:
		raise
	except ImageModerationUnavailable:
		if bool(getattr(settings, 'IMAGE_MODERATION_FAIL_CLOSED', True)):
			logger.warning('Local image moderation unavailable for surface=%s', surface, exc_info=True)
			raise
		logger.warning('Local image moderation unavailable; allowing upload for surface=%s', surface, exc_info=True)
		return

	try:
		cache.set(
			cache_key,
			detections,
			timeout=max(60, int(getattr(settings, 'IMAGE_MODERATION_CACHE_TIMEOUT', 86400) or 86400)),
		)
	except Exception:
		logger.warning('Image moderation result cache unavailable for surface=%s', surface, exc_info=True)

	_raise_if_blocked(detections, block_score)


def _read_uploaded_file(uploaded_file):
	max_upload_bytes = max(1, int(getattr(settings, 'IMAGE_MODERATION_MAX_UPLOAD_BYTES', 16 * 1024 * 1024) or 16 * 1024 * 1024))
	declared_size = getattr(uploaded_file, 'size', None)
	if declared_size not in (None, '') and int(declared_size) > max_upload_bytes:
		raise ImageModerationRejected('This image is too large to screen. Choose an image smaller than 16 MB.')

	uploaded_file.seek(0)
	try:
		raw_bytes = uploaded_file.read(max_upload_bytes + 1)
	finally:
		uploaded_file.seek(0)

	if len(raw_bytes) > max_upload_bytes:
		raise ImageModerationRejected('This image is too large to screen. Choose an image smaller than 16 MB.')
	if not raw_bytes:
		raise ImageModerationRejected('The selected image is empty or unreadable.')
	return raw_bytes


def _prepare_image_for_local_model(raw_bytes):
	try:
		with Image.open(io.BytesIO(raw_bytes)) as source_image:
			image = ImageOps.exif_transpose(source_image)
			if image.width < 50 or image.height < 50:
				raise ImageModerationRejected('Images must be at least 50 by 50 pixels.')
			if image.mode in {'RGBA', 'LA'} or 'transparency' in image.info:
				rgba_image = image.convert('RGBA')
				rgb_image = Image.new('RGB', rgba_image.size, 'white')
				rgb_image.paste(rgba_image, mask=rgba_image.getchannel('A'))
				image = rgb_image
			else:
				image = image.convert('RGB')

			buffer = io.BytesIO()
			image.save(buffer, format='JPEG', quality=88, optimize=True)
			return buffer.getvalue()
	except ImageModerationRejected:
		raise
	except Exception as error:
		raise ImageModerationRejected('The selected image could not be read for automated screening.') from error


def _get_local_detector():
	global _detector
	if _detector is not None:
		return _detector

	with _detector_lock:
		if _detector is not None:
			return _detector
		try:
			from nudenet import NudeDetector
			_detector = NudeDetector()
		except Exception as error:
			raise ImageModerationUnavailable('The local image screening model is unavailable. Try again shortly.') from error
	return _detector


def _detect_with_local_model(image_bytes):
	try:
		raw_detections = _get_local_detector().detect(image_bytes)
	except Exception as error:
		raise ImageModerationUnavailable('The local image screening model is unavailable. Try again shortly.') from error

	detections = []
	for detection in raw_detections or []:
		if not isinstance(detection, dict):
			continue
		label = str(detection.get('class') or '').strip().upper()
		if label not in LOCAL_NUDENET_BLOCKED_CLASSES:
			continue
		try:
			score = float(detection.get('score', 0) or 0)
		except (TypeError, ValueError):
			continue
		detections.append({'class': label, 'score': score})
	return detections


def _raise_if_blocked(detections, block_score):
	if any(float(detection.get('score', 0) or 0) >= block_score for detection in detections or []):
		raise ImageModerationRejected(
			'This image cannot be posted because automated screening detected potentially explicit content.'
		)