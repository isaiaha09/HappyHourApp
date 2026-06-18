from django.conf import settings
from django.utils import timezone
import requests

from places.models import FavoriteBusinessPushDevice


def send_push_notifications_for_direct_message(user_ids, *, thread_id, listing_slug, title, message=''):
	if not getattr(settings, 'EXPO_PUSH_NOTIFICATIONS_ENABLED', True):
		return 0
	if not user_ids:
		return 0

	devices = list(
		FavoriteBusinessPushDevice.objects
		.filter(user_id__in=user_ids, is_active=True)
		.exclude(expo_push_token='')
	)
	if not devices:
		return 0

	body = str(message or '').strip() or title
	now = timezone.now()
	delivered_count = 0

	for chunk_start in range(0, len(devices), 100):
		device_chunk = devices[chunk_start:chunk_start + 100]
		messages = [
			{
				'to': device.expo_push_token,
				'title': title,
				'body': body,
				'sound': 'default',
				'channelId': 'business-updates',
				'data': {
					'type': 'direct_message',
					'thread_id': thread_id,
					'slug': listing_slug,
				},
			}
			for device in device_chunk
		]

		try:
			response = requests.post(
				getattr(settings, 'EXPO_PUSH_API_URL', 'https://exp.host/--/api/v2/push/send'),
				json=messages,
				headers={
					'Accept': 'application/json',
					'Accept-Encoding': 'gzip, deflate',
					'Content-Type': 'application/json',
				},
				timeout=getattr(settings, 'EXPO_PUSH_TIMEOUT', 10),
			)
			response.raise_for_status()
			payload = response.json() if response.content else {}
		except (requests.RequestException, ValueError, TypeError) as error:
			FavoriteBusinessPushDevice.objects.filter(pk__in=[device.pk for device in device_chunk]).update(last_error=str(error))
			continue

		result_entries = payload.get('data') if isinstance(payload, dict) else []
		devices_to_update = []
		for index, device in enumerate(device_chunk):
			entry = result_entries[index] if isinstance(result_entries, list) and index < len(result_entries) and isinstance(result_entries[index], dict) else {}
			status = entry.get('status')
			details = entry.get('details') if isinstance(entry.get('details'), dict) else {}
			error = str(details.get('error') or entry.get('message') or '').strip()
			if status == 'ok':
				device.is_active = True
				device.last_error = ''
				device.last_push_sent_at = now
				delivered_count += 1
			elif error == 'DeviceNotRegistered':
				device.is_active = False
				device.last_error = error
			else:
				device.last_error = error or 'Expo push delivery failed.'
			devices_to_update.append(device)

		if devices_to_update:
			FavoriteBusinessPushDevice.objects.bulk_update(devices_to_update, ['is_active', 'last_error', 'last_push_sent_at', 'last_registered_at'])

	return delivered_count
