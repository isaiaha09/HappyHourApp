from places.models import FavoriteBusiness, FavoriteBusinessNotification
from places.services.favorite_push import send_push_notifications_for_favorite_business_event


PROFILE_UPDATE_GROUPS = (
	(('operating_hour_overrides', 'hours_of_operation_entries_text'), 'hours'),
	(('deal_overrides', 'offer_entries_text'), 'deals'),
	(('photo_references_text',), 'photos'),
	(('employer_address',), 'address'),
	(('work_phone',), 'phone number'),
	(('business_website_url', 'social_profiles', 'social_media_links_text'), 'links'),
	(('contact_name', 'job_title', 'work_email', 'supporting_details'), 'profile details'),
)


def create_notifications_for_business_profile_update(claim, changed_field_names):
	listing_slug = str(claim.listing_snapshot.listing_slug or '').strip()
	if not listing_slug:
		return 0

	labels = _get_profile_update_labels(changed_field_names)
	business_name = claim.listing_snapshot.name
	message = f'Updated {labels[0]}.' if len(labels) == 1 else f'Updated {_join_labels(labels)}.'
	return _create_notifications(
		listing_slug=listing_slug,
		business_name=business_name,
		event_type=FavoriteBusinessNotification.EventType.PROFILE_UPDATE,
		title=f'{business_name} updated its business profile',
		message=message,
	)


def create_notifications_for_published_post(post):
	listing_slug = str(post.listing_snapshot.listing_slug or '').strip()
	if not listing_slug:
		return 0

	business_name = post.listing_snapshot.name
	content_label = post.get_content_type_display()
	message = post.summary or post.title
	if len(message) > 400:
		message = f'{message[:397].rstrip()}...'
	return _create_notifications(
		listing_slug=listing_slug,
		business_name=business_name,
		event_type=post.content_type,
		title=f'New {content_label.lower()} from {business_name}',
		message=message,
		source_post=post,
	)


def _create_notifications(listing_slug, business_name, event_type, title, message='', source_post=None):
	user_ids = list(
		FavoriteBusiness.objects
		.filter(listing_slug=listing_slug)
		.values_list('user_id', flat=True)
	)
	if not user_ids:
		return 0

	FavoriteBusinessNotification.objects.bulk_create([
		FavoriteBusinessNotification(
			user_id=user_id,
			listing_slug=listing_slug,
			business_name=business_name,
			event_type=event_type,
			title=title,
			message=message,
			source_post=source_post,
		)
		for user_id in user_ids
	])
	send_push_notifications_for_favorite_business_event(
		user_ids,
		listing_slug=listing_slug,
		title=title,
		message=message,
		event_type=event_type,
	)
	return len(user_ids)


def _get_profile_update_labels(changed_field_names):
	changed_names = set(changed_field_names)
	labels = []
	for field_names, label in PROFILE_UPDATE_GROUPS:
		if any(field_name in changed_names for field_name in field_names):
			labels.append(label)
	return labels or ['profile details']


def _join_labels(labels):
	if len(labels) == 2:
		return f'{labels[0]} and {labels[1]}'
	return f"{', '.join(labels[:-1])}, and {labels[-1]}"