from collections import Counter
from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone

from places.models import BusinessPost, FeedImpression, SponsoredCampaign


SPONSORED_INTERVALS = (4, 5, 6)


def get_requested_feed_page_size(requested_value, default=12, max_size=30):
	try:
		parsed = int(requested_value) if requested_value is not None else default
	except (TypeError, ValueError):
		parsed = default
	return max(6, min(parsed, max_size))


def get_feed_interval(page_number):
	return SPONSORED_INTERVALS[(max(page_number, 1) - 1) % len(SPONSORED_INTERVALS)]


def get_organic_page_size(mixed_page_size, interval):
	return max(1, mixed_page_size - (mixed_page_size // (interval + 1)))


def get_feed_queryset(*, city=None, content_types=None, reference_time=None):
	reference = reference_time or timezone.now()
	queryset = (
		BusinessPost.objects
		.filter(status=BusinessPost.Status.PUBLISHED)
		.filter(Q(published_at__isnull=True) | Q(published_at__lte=reference))
		.filter(Q(starts_at__isnull=True) | Q(starts_at__lte=reference))
		.filter(Q(ends_at__isnull=True) | Q(ends_at__gte=reference))
		.select_related('membership__user', 'listing_snapshot')
	)

	if city:
		queryset = queryset.filter(listing_snapshot__city=city)
	if content_types:
		queryset = queryset.filter(content_type__in=content_types)

	return queryset.order_by('-published_at', '-created_at', '-pk')


def get_ranked_campaigns(*, city=None, venue_type=None, reference_time=None):
	reference = reference_time or timezone.now()
	window_start = reference - timedelta(days=7)
	queryset = (
		SponsoredCampaign.objects
		.filter(status=SponsoredCampaign.Status.ACTIVE)
		.filter(starts_at__lte=reference)
		.filter(Q(ends_at__isnull=True) | Q(ends_at__gte=reference))
		.filter(post__status=BusinessPost.Status.PUBLISHED)
		.select_related('membership__claim__listing_snapshot', 'post', 'post__listing_snapshot')
		.annotate(
			window_impressions=Count('impressions', filter=Q(impressions__created_at__gte=window_start)),
			window_clicks=Count('engagements', filter=Q(engagements__created_at__gte=window_start, engagements__event_type='click')),
		)
	)

	if city:
		queryset = queryset.filter(Q(target_cities=[]) | Q(target_cities__contains=[city]))
	if venue_type:
		queryset = queryset.filter(Q(target_venue_types=[]) | Q(target_venue_types__contains=[venue_type]))

	eligible_campaigns = []
	for campaign in queryset.order_by('window_impressions', 'last_served_at', 'starts_at', 'pk'):
		if campaign.weekly_impression_quota and campaign.window_impressions >= campaign.weekly_impression_quota:
			continue
		eligible_campaigns.append(campaign)
	return eligible_campaigns


def build_feed_item(post, *, campaign=None):
	listing = post.listing_snapshot
	is_sponsored = campaign is not None
	item_type = 'sponsored' if is_sponsored else post.content_type
	feed_item_id = f'campaign-{campaign.pk}' if is_sponsored else f'post-{post.pk}'

	return {
		'id': feed_item_id,
		'item_type': item_type,
		'is_sponsored': is_sponsored,
		'post_id': post.pk,
		'campaign_id': campaign.pk if campaign is not None else None,
		'business_name': listing.name,
		'business_slug': listing.listing_slug,
		'city': listing.city,
		'city_label': listing.get_city_display() if listing.city else '',
		'venue_type': listing.venue_type,
		'venue_type_label': listing.get_venue_type_display() if listing.venue_type else '',
		'title': post.title,
		'summary': post.summary,
		'body': post.body,
		'hero_image_url': post.hero_image_url,
		'cta_label': post.cta_label,
		'cta_url': post.cta_url,
		'published_at': post.published_at,
		'starts_at': post.starts_at,
		'ends_at': post.ends_at,
		'sponsor_label': campaign.name if campaign is not None else '',
	}


def mix_feed_items(*, posts, campaigns, page_number, mixed_page_size):
	interval = get_feed_interval(page_number)
	planned_impressions = Counter()
	used_campaign_ids = set()
	results = []
	organic_since_sponsored = 0
	campaign_index = 0

	for post in posts:
		if len(results) >= mixed_page_size:
			break
		results.append(build_feed_item(post))
		organic_since_sponsored += 1

		if organic_since_sponsored < interval or len(results) >= mixed_page_size:
			continue

		selected_campaign = None
		while campaign_index < len(campaigns):
			candidate = campaigns[campaign_index]
			campaign_index += 1
			if candidate.pk in used_campaign_ids:
				continue
			selected_campaign = candidate
			break

		if selected_campaign is None:
			fallback_last_served = timezone.now() - timedelta(days=3650)
			fallback_campaigns = sorted(
				campaigns,
				key=lambda candidate: (planned_impressions[candidate.pk], candidate.window_impressions, candidate.last_served_at or fallback_last_served, candidate.pk),
			)
			selected_campaign = fallback_campaigns[0] if fallback_campaigns else None

		if selected_campaign is None:
			organic_since_sponsored = 0
			continue

		results.append(build_feed_item(selected_campaign.post, campaign=selected_campaign))
		planned_impressions[selected_campaign.pk] += 1
		used_campaign_ids.add(selected_campaign.pk)
		organic_since_sponsored = 0

	return results[:mixed_page_size]


def record_campaign_served(campaign):
	SponsoredCampaign.objects.filter(pk=campaign.pk).update(last_served_at=timezone.now())
