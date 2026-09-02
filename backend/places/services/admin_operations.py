import json
from collections import Counter
from datetime import timedelta

from django.conf import settings
from django.contrib.admin.models import ADDITION, CHANGE, DELETION, LogEntry
from django.contrib.contenttypes.models import ContentType
from django.core.cache import cache
from django.db.models import Count, Prefetch, Q
from django.db.models.functions import Coalesce, TruncDate
from django.urls import NoReverseMatch, reverse
from django.utils import timezone
from unfold.dataclasses import SearchResult

from places.admin_security import emit_admin_security_event
from places.models import (
	BusinessClaim,
	BusinessDirectMessage,
	BusinessDirectMessageThread,
	BusinessMembership,
	BusinessPost,
	ContentReport,
	FeedEngagement,
	FeedImpression,
	FavoriteBusiness,
	FavoriteBusinessNotification,
	AdminAuditEvent,
	BusinessAccount,
	CustomerAccount,
	ListingSnapshot,
	SponsoredCampaign,
	VenueType,
)


REVIEWABLE_CLAIM_STATUSES = (
	BusinessClaim.Status.SUBMITTED,
	BusinessClaim.Status.UNDER_REVIEW,
	BusinessClaim.Status.NEEDS_INFO,
)
OPEN_REPORT_STATUSES = (
	ContentReport.Status.OPEN,
	ContentReport.Status.IN_REVIEW,
)
HEALTH_STALE_AFTER_DAYS = 30
LIVE_LOCATION_STALE_AFTER_MINUTES = 45
REVIEW_SLA_HOURS = 48
ADMIN_CACHE_VERSION_KEY = 'admin-operations-cache-version'
_PAYLOAD_NOT_PROVIDED = object()

HEALTH_ISSUE_DETAILS = {
	'missing_address': {'label': 'Missing street address', 'severity': 'danger'},
	'missing_website': {'label': 'Missing website', 'severity': 'danger'},
	'missing_coordinates': {'label': 'Missing coordinates', 'severity': 'danger'},
	'missing_hours': {'label': 'Missing operating hours', 'severity': 'warning'},
	'missing_active_deals': {'label': 'No active deals', 'severity': 'warning'},
	'missing_phone': {'label': 'Missing public phone', 'severity': 'warning'},
	'missing_images': {'label': 'Missing public images', 'severity': 'warning'},
	'stale_snapshot': {'label': 'Stale source refresh', 'severity': 'warning'},
	'duplicate_listing_identity': {'label': 'Duplicate listing identity', 'severity': 'danger'},
	'live_location_not_reporting': {'label': 'Live location is not reporting', 'severity': 'danger'},
}


def _admin_cache_timeout(setting_name, default):
	try:
		return max(int(getattr(settings, setting_name, default)), 0)
	except (TypeError, ValueError):
		return default


def _admin_cache_get(key):
	try:
		return cache.get(key)
	except Exception:
		# A cache outage should never take the staff admin offline.
		return None


def _admin_cache_set(key, value, timeout):
	try:
		cache.set(key, value, timeout)
	except Exception:
		# Fall back to the uncached result when Redis or another cache backend is unavailable.
		return None
	return value


def _admin_cache_version():
	version = _admin_cache_get(ADMIN_CACHE_VERSION_KEY)
	if version is not None:
		return version
	try:
		cache.add(ADMIN_CACHE_VERSION_KEY, 1, None)
		return _admin_cache_get(ADMIN_CACHE_VERSION_KEY) or 1
	except Exception:
		return 1


def _admin_cache_key(name, *parts):
	return ':'.join(
		['admin-operations', str(_admin_cache_version()), name, *(str(part) for part in parts)]
	)


def invalidate_admin_operations_cache():
	"""Invalidate derived admin metrics after catalog/account changes."""
	try:
		version = _admin_cache_version()
		cache.set(ADMIN_CACHE_VERSION_KEY, int(version) + 1, None)
	except Exception:
		return None


def _get_cached_admin_value(name, builder, timeout, *parts):
	if timeout <= 0:
		return builder()

	cache_key = _admin_cache_key(name, *parts)
	cached_value = _admin_cache_get(cache_key)
	if cached_value is not None:
		return cached_value

	value = builder()
	_admin_cache_set(cache_key, value, timeout)
	return value


def get_review_sla_hours():
	try:
		return max(int(getattr(settings, 'BUSINESS_CLAIM_REVIEW_SLA_HOURS', REVIEW_SLA_HOURS)), 1)
	except (TypeError, ValueError):
		return REVIEW_SLA_HOURS


def get_review_sla_delta():
	return timedelta(hours=get_review_sla_hours())


def get_claim_review_queryset():
	return (
		BusinessClaim.objects
		.filter(status__in=REVIEWABLE_CLAIM_STATUSES)
		.select_related('claimant', 'listing_snapshot', 'reviewed_by')
		.prefetch_related('attachments', 'profile_entries')
		.annotate(review_order_at=Coalesce('submitted_at', 'created_at'))
		.order_by('review_order_at', 'pk')
	)


def get_content_report_queue_queryset():
	return (
		ContentReport.objects
		.filter(status__in=OPEN_REPORT_STATUSES)
		.select_related(
			'reporter',
			'reviewed_by',
			'business_post__listing_snapshot',
			'direct_message__thread__business_claim__listing_snapshot',
		)
		.order_by('status', 'created_at', 'pk')
	)


def _get_catalog_health_payload_map():
	"""Load public payloads without provider geocoding so health reflects stored data."""
	try:
		from places.services.source_listings import get_source_place_payloads

		payload_map = {}
		for payload in get_source_place_payloads(resolve_missing_coordinates=False, allow_network=False):
			for slug in [payload.get('slug'), *(location.get('slug') for location in payload.get('locations', []))]:
				if slug:
					payload_map[str(slug)] = payload
		return payload_map
	except Exception:
		# A broken provider payload should not take the staff admin offline. The
		# stored snapshot checks below still provide useful signals in that case.
		return {}


def _get_duplicate_listing_identity_keys(snapshots):
	identity_values = {}
	for snapshot in snapshots:
		identity_parts = []
		if snapshot.listing_slug:
			identity_parts.append(('listing_slug', str(snapshot.listing_slug).strip().lower()))
		if snapshot.source_name and snapshot.external_id:
			identity_parts.append((
				'source_external_id',
				f'{str(snapshot.source_name).strip().lower()}:{str(snapshot.external_id).strip().lower()}',
			))
		for identity_type, identity_value in identity_parts:
			if identity_value:
				identity_values.setdefault((identity_type, identity_value), set()).add(snapshot.pk)
	return {
		(identity_type, identity_value)
		for (identity_type, identity_value), snapshot_ids in identity_values.items()
		if len(snapshot_ids) > 1
	}


def get_listing_snapshot_health_issues(snapshot, now=None, payload=_PAYLOAD_NOT_PROVIDED, duplicate_identity=False):
	reference_time = now or timezone.now()
	issues = []
	public_payload = payload
	if public_payload is _PAYLOAD_NOT_PROVIDED and snapshot.listing_slug:
		public_payload = _get_catalog_health_payload_map().get(snapshot.listing_slug)
	if public_payload is _PAYLOAD_NOT_PROVIDED:
		public_payload = None
	has_public_payload = public_payload is not None
	public_payload = public_payload or {}

	public_website = str(
		public_payload.get('website_url')
		if has_public_payload
		else ('' if snapshot.website_url_suppressed else snapshot.website_url)
		or ''
	).strip()
	public_images = list((public_payload.get('image_urls') if has_public_payload else snapshot.imported_image_urls) or [])
	public_hours = list(public_payload.get('operating_hours') or [])
	public_deals = list(public_payload.get('deals') or [])
	public_address = str((public_payload.get('address_line_1') if has_public_payload else snapshot.address_line_1) or '').strip()
	public_phone = str((public_payload.get('phone_number') if has_public_payload else snapshot.phone_number) or '').strip()
	coordinates_present = (
		public_payload.get('latitude') is not None
		and public_payload.get('longitude') is not None
	)
	if not coordinates_present:
		for location in public_payload.get('locations', []):
			if location.get('latitude') is not None and location.get('longitude') is not None:
				coordinates_present = True
				break

	if not public_address and not bool(snapshot.serves_multiple_areas):
		issues.append('missing_address')
	if not public_website:
		issues.append('missing_website')
	if not coordinates_present and not _requires_live_location(snapshot):
		issues.append('missing_coordinates')
	if not public_hours and not snapshot.operating_hour_overrides:
		issues.append('missing_hours')
	if not public_deals and not snapshot.deal_overrides:
		issues.append('missing_active_deals')
	if not public_phone:
		issues.append('missing_phone')
	if not public_images:
		issues.append('missing_images')
	if snapshot.updated_at and snapshot.updated_at < reference_time - timedelta(days=HEALTH_STALE_AFTER_DAYS):
		issues.append('stale_snapshot')
	if duplicate_identity:
		issues.append('duplicate_listing_identity')
	if _requires_live_location(snapshot) and _has_active_membership(snapshot):
		last_reported_at = snapshot.tracked_location_updated_at
		if last_reported_at is None or last_reported_at < reference_time - timedelta(minutes=LIVE_LOCATION_STALE_AFTER_MINUTES):
			issues.append('live_location_not_reporting')

	return issues


def get_catalog_health(now=None, limit=12):
	reference_time = now or timezone.now()
	if now is not None:
		return _build_catalog_health(reference_time, limit=limit)

	timeout = _admin_cache_timeout('ADMIN_OPERATIONS_CACHE_TIMEOUT', 30)
	if timeout <= 0:
		return _build_catalog_health(reference_time, limit=limit)

	cache_key = _admin_cache_key(
		'catalog-health',
		'all' if limit is None else limit,
	)
	cached_health = _admin_cache_get(cache_key)
	if cached_health is not None:
		return cached_health

	health = _build_catalog_health(reference_time, limit=limit)
	_admin_cache_set(cache_key, health, timeout)
	return health


def _build_catalog_health(reference_time, limit=12):
	snapshots = list(
		ListingSnapshot.objects
		.prefetch_related(
			Prefetch(
				'business_claims',
				queryset=BusinessClaim.objects.select_related('membership'),
			)
		)
		.order_by('name', 'pk')
	)
	payload_map = _get_catalog_health_payload_map()
	duplicate_identity_keys = _get_duplicate_listing_identity_keys(snapshots)
	issue_counts = Counter()
	attention = []
	total_snapshots = 0
	attention_count = 0
	issue_map = {}

	for snapshot in snapshots:
		total_snapshots += 1
		duplicate_identity = any(
			key in duplicate_identity_keys
			for key in (
				('listing_slug', str(snapshot.listing_slug or '').strip().lower()),
				('source_external_id', f'{str(snapshot.source_name or "").strip().lower()}:{str(snapshot.external_id or "").strip().lower()}'),
			)
			if key[1].strip(':')
		)
		issues = get_listing_snapshot_health_issues(
			snapshot,
			now=reference_time,
			payload=payload_map.get(snapshot.listing_slug),
			duplicate_identity=duplicate_identity,
		)
		issue_map[snapshot.pk] = issues
		issue_counts.update(issues)
		if not issues:
			continue
		attention_count += 1
		if limit == 0:
			continue
		attention.append({
			'snapshot': snapshot,
			'issues': [HEALTH_ISSUE_DETAILS[issue] | {'code': issue} for issue in issues],
			'change_url': _admin_change_url(snapshot, include_unmanaged=True),
			'delete_url': _admin_delete_url(snapshot, include_unmanaged=True),
		})

	severity_order = {'danger': 0, 'warning': 1}
	attention.sort(
		key=lambda item: (
			min(severity_order.get(issue['severity'], 2) for issue in item['issues']),
			-item['snapshot'].updated_at.timestamp() if item['snapshot'].updated_at else 0,
			item['snapshot'].name.lower(),
		)
	)

	return {
		'total_snapshots': total_snapshots,
		'attention_count': attention_count,
		'healthy_count': max(total_snapshots - attention_count, 0),
		'issues': [
			{
				'code': code,
				'label': HEALTH_ISSUE_DETAILS[code]['label'],
				'severity': HEALTH_ISSUE_DETAILS[code]['severity'],
				'count': count,
			}
			for code, count in sorted(
				issue_counts.items(),
				key=lambda item: (severity_order.get(HEALTH_ISSUE_DETAILS[item[0]]['severity'], 2), -item[1], item[0]),
			)
		],
		'attention': attention if limit is None else attention[:limit],
		'issue_map': issue_map,
	}


def _get_engagement_count(queryset, event_type):
	return queryset.filter(event_type=event_type).count()


def _get_claim_funnel(window_start):
	return {
		'submitted': BusinessClaim.objects.filter(submitted_at__gte=window_start).count(),
		'under_review': BusinessClaim.objects.filter(
			status=BusinessClaim.Status.UNDER_REVIEW,
			updated_at__gte=window_start,
		).count(),
		'approved': BusinessClaim.objects.filter(
			status=BusinessClaim.Status.APPROVED,
			reviewed_at__gte=window_start,
		).count(),
		'rejected': BusinessClaim.objects.filter(
			status=BusinessClaim.Status.REJECTED,
			reviewed_at__gte=window_start,
		).count(),
	}


def _get_top_businesses(window_start):
	businesses = (
		ListingSnapshot.objects
		.annotate(
			impressions_7d=Count(
				'posts__feed_impressions',
				filter=Q(
					posts__status=BusinessPost.Status.PUBLISHED,
					posts__feed_impressions__created_at__gte=window_start,
				),
				distinct=True,
			),
				engagements_7d=Count(
				'posts__feed_engagements',
				filter=Q(
					posts__status=BusinessPost.Status.PUBLISHED,
					posts__feed_engagements__created_at__gte=window_start,
				),
				distinct=True,
			),
		)
		.filter(Q(impressions_7d__gt=0) | Q(engagements_7d__gt=0))
		.order_by('-engagements_7d', '-impressions_7d', 'name', 'pk')[:8]
	)
	return [
		{
			'business': business,
			'change_url': _admin_change_url(business),
			'impression_count': business.impressions_7d,
			'engagement_count': business.engagements_7d,
			'engagement_rate': _percentage(business.engagements_7d, business.impressions_7d),
		}
		for business in businesses
	]


def get_analytics_data(now=None, days=7):
	reference_time = now or timezone.now()
	days = 30 if int(days or 7) >= 30 else 7
	start_date = timezone.localdate(reference_time) - timedelta(days=max(days - 1, 0))
	window_start = reference_time - timedelta(days=days)
	impressions = FeedImpression.objects.filter(created_at__gte=window_start)
	engagements = FeedEngagement.objects.filter(created_at__gte=window_start)
	click_count = _get_engagement_count(engagements, FeedEngagement.EventType.CLICK)
	open_count = _get_engagement_count(engagements, FeedEngagement.EventType.OPEN)
	save_count = _get_engagement_count(engagements, FeedEngagement.EventType.SAVE)
	share_count = _get_engagement_count(engagements, FeedEngagement.EventType.SHARE)
	impression_count = impressions.count()
	engagement_count = engagements.count()
	customer_signup_count = CustomerAccount.objects.filter(date_joined__gte=window_start).count()
	business_signup_count = BusinessAccount.objects.filter(date_joined__gte=window_start).count()
	business_application_count = BusinessClaim.objects.filter(created_at__gte=window_start).count()

	feed_chart = _chart_data(
		start_date=start_date,
		days=days,
		series=(
			('Impressions', _daily_counts(impressions, 'created_at', start_date, days), 'var(--color-primary-400)'),
			('Clicks', _daily_counts(engagements.filter(event_type=FeedEngagement.EventType.CLICK), 'created_at', start_date, days), 'var(--dd-neon-yellow)'),
			('Opens', _daily_counts(engagements.filter(event_type=FeedEngagement.EventType.OPEN), 'created_at', start_date, days), '#f9a8d4'),
			('Saves', _daily_counts(engagements.filter(event_type=FeedEngagement.EventType.SAVE), 'created_at', start_date, days), '#86efac'),
			('Shares', _daily_counts(engagements.filter(event_type=FeedEngagement.EventType.SHARE), 'created_at', start_date, days), '#c4b5fd'),
		),
	)
	signup_chart = _chart_data(
		start_date=start_date,
		days=days,
		series=(
			('Customer signups', _daily_counts(CustomerAccount.objects.filter(date_joined__gte=window_start), 'date_joined', start_date, days), 'var(--color-primary-400)'),
			('Business signups', _daily_counts(BusinessAccount.objects.filter(date_joined__gte=window_start), 'date_joined', start_date, days), 'var(--dd-neon-yellow)'),
		),
	)
	active_campaign_queryset = _get_active_campaign_queryset(reference_time)
	active_campaign_count = active_campaign_queryset.count()
	active_campaign_delivery = active_campaign_queryset.annotate(
		window_impressions=Count(
			'impressions',
			filter=Q(impressions__created_at__gte=window_start),
			distinct=True,
		)
	)
	remaining_campaign_quota = sum(
		max(campaign.weekly_impression_quota - campaign.window_impressions, 0)
		for campaign in active_campaign_delivery
	)

	return {
		'window_days': days,
		'impressions': impression_count,
		'engagements': engagement_count,
		'clicks': click_count,
		'opens': open_count,
		'saves': save_count,
		'shares': share_count,
		'engagement_rate': _percentage(engagement_count, impression_count),
		'click_through_rate': _percentage(click_count, impression_count),
		'favorites_added': FavoriteBusiness.objects.filter(created_at__gte=window_start).count(),
		'notifications_created': FavoriteBusinessNotification.objects.filter(created_at__gte=window_start).count(),
		'direct_messages': BusinessDirectMessage.objects.filter(created_at__gte=window_start).count(),
		'direct_message_threads': BusinessDirectMessageThread.objects.filter(created_at__gte=window_start).count(),
		'new_users': customer_signup_count + business_signup_count,
		'customer_signups': customer_signup_count,
		'business_signups': business_signup_count,
		'business_applications': business_application_count,
		'active_campaigns': active_campaign_count,
		'remaining_campaign_quota': remaining_campaign_quota,
		'feed_chart_json': json.dumps(feed_chart),
		'signup_chart_json': json.dumps(signup_chart),
		'claim_funnel': _get_claim_funnel(window_start),
		'top_businesses': _get_top_businesses(window_start),
		'top_posts': _get_top_posts(window_start),
		'campaigns': _get_campaign_performance(reference_time, window_start),
	}


def get_operations_dashboard_data(now=None, days=7):
	reference_time = now or timezone.now()
	claim_queue = get_claim_review_queryset()
	report_queue = get_content_report_queue_queryset()
	# Let catalog health use its own short-lived cache. The dashboard already
	# carries the generated timestamp, and a few milliseconds of reference-time
	# difference do not change the operational meaning of these metrics.
	health = get_catalog_health()
	active_campaigns = _get_active_campaign_queryset(reference_time)
	overdue_threshold = reference_time - get_review_sla_delta()
	overdue_claims = claim_queue.filter(
		Q(submitted_at__lte=overdue_threshold)
		| Q(submitted_at__isnull=True, created_at__lte=overdue_threshold)
	)
	oldest_pending_claim = claim_queue.first()
	analytics = get_analytics_data(now=reference_time, days=days)
	active_memberships = BusinessMembership.objects.filter(is_active=True).count()

	return {
		'generated_at': reference_time,
		'metrics': {
			'claims_needing_review': claim_queue.count(),
			'overdue_claims': overdue_claims.count(),
			'review_sla_hours': get_review_sla_hours(),
			'oldest_pending_claim': oldest_pending_claim,
			'active_business_memberships': active_memberships,
			'open_reports': report_queue.count(),
			'catalog_attention': health['attention_count'],
			'active_campaigns': active_campaigns.count(),
			'remaining_campaign_quota': analytics['remaining_campaign_quota'],
			'live_location_offline': _get_live_location_offline_count(reference_time),
		},
		'claim_queue': list(claim_queue[:8]),
		'report_queue': list(report_queue[:8]),
		'catalog_health': health,
		'analytics': analytics,
		'audit_events': get_audit_timeline(limit=8),
	}


def dashboard_callback(request, context):
	try:
		days = 30 if int(request.GET.get('days', 7)) >= 30 else 7
	except (TypeError, ValueError):
		days = 7
	context['operations'] = _get_cached_admin_value(
		'dashboard',
		lambda: get_operations_dashboard_data(days=days),
		_admin_cache_timeout('ADMIN_OPERATIONS_CACHE_TIMEOUT', 30),
		days,
	)
	return context


def get_cached_analytics_data(days=7):
	try:
		days = 30 if int(days or 7) >= 30 else 7
	except (TypeError, ValueError):
		days = 7
	return _get_cached_admin_value(
		'analytics',
		lambda: get_analytics_data(days=days),
		_admin_cache_timeout('ADMIN_OPERATIONS_CACHE_TIMEOUT', 30),
		days,
	)


def get_audit_timeline(limit=50):
	events = []
	audit_events = list(
		AdminAuditEvent.objects
		.select_related('actor', 'content_type')
		.order_by('-created_at', '-pk')[:limit]
	)
	custom_event_keys = set()
	for audit_event in audit_events:
		custom_event_keys.add((audit_event.actor_id, audit_event.object_id, audit_event.message))
		events.append({
			'entry': None,
			'object_repr': audit_event.object_repr or 'Admin operation',
			'user': audit_event.actor,
			'action_time': audit_event.created_at,
			'action_label': audit_event.event_type.replace('_', ' ').capitalize(),
			'message': audit_event.message,
			'object_url': _audit_object_url_for_content_type(audit_event.content_type, audit_event.object_id),
		})

	for entry in LogEntry.objects.select_related('user', 'content_type').order_by('-action_time', '-pk')[:limit]:
		message = entry.get_change_message() or 'No additional detail recorded.'
		if (entry.user_id, str(entry.object_id), message) in custom_event_keys:
			continue
		events.append({
			'entry': entry,
			'object_repr': entry.object_repr,
			'user': entry.user,
			'action_time': entry.action_time,
			'action_label': _audit_action_label(entry.action_flag),
			'message': message,
			'object_url': _audit_object_url(entry),
		})
	return sorted(events, key=lambda event: (event['action_time'],), reverse=True)[:limit]


def record_admin_audit_event(request, obj, message, action_flag=CHANGE):
	if not getattr(request.user, 'is_authenticated', False) or not getattr(request.user, 'pk', None):
		return
	content_type = ContentType.objects.get_for_model(obj, for_concrete_model=False)
	AdminAuditEvent.objects.create(
		actor=request.user,
		content_type=content_type,
		object_id=str(obj.pk),
		object_repr=str(obj),
		event_type='admin_operation',
		message=message,
	)
	LogEntry.objects.log_actions(
		user_id=request.user.pk,
		queryset=obj.__class__._default_manager.filter(pk=obj.pk),
		action_flag=action_flag,
		change_message=message,
		single_object=True,
	)
	emit_admin_security_event(
		request,
		'admin_operation',
		actor=request.user,
		object_type=obj.__class__._meta.label,
		object_id=str(obj.pk),
		action_flag=action_flag,
		message=str(message)[:500],
	)


def pending_claim_badge(_request):
	return _get_cached_admin_value(
		'badge',
		lambda: get_claim_review_queryset().count(),
		_admin_cache_timeout('ADMIN_BADGE_CACHE_TIMEOUT', 15),
		'pending-claims',
	)


def overdue_claim_badge(_request):
	def count_overdue_claims():
		now = timezone.now()
		threshold = now - get_review_sla_delta()
		return get_claim_review_queryset().filter(
			Q(submitted_at__lte=threshold)
			| Q(submitted_at__isnull=True, created_at__lte=threshold)
		).count()

	return _get_cached_admin_value(
		'badge',
		count_overdue_claims,
		_admin_cache_timeout('ADMIN_BADGE_CACHE_TIMEOUT', 15),
		'overdue-claims',
	)


def open_report_badge(_request):
	return _get_cached_admin_value(
		'badge',
		lambda: get_content_report_queue_queryset().count(),
		_admin_cache_timeout('ADMIN_BADGE_CACHE_TIMEOUT', 15),
		'open-reports',
	)


def catalog_attention_badge(_request):
	return _get_cached_admin_value(
		'badge',
		lambda: get_catalog_health(limit=0)['attention_count'],
		_admin_cache_timeout('ADMIN_BADGE_CACHE_TIMEOUT', 15),
		'catalog-attention',
	)


def active_membership_badge(_request):
	return _get_cached_admin_value(
		'badge',
		lambda: BusinessMembership.objects.filter(is_active=True).count(),
		_admin_cache_timeout('ADMIN_BADGE_CACHE_TIMEOUT', 15),
		'active-memberships',
	)


def active_campaign_badge(_request):
	return _get_cached_admin_value(
		'badge',
		lambda: _get_active_campaign_queryset(timezone.now()).count(),
		_admin_cache_timeout('ADMIN_BADGE_CACHE_TIMEOUT', 15),
		'active-campaigns',
	)


def command_search(_request, search_term):
	normalized_term = str(search_term or '').strip().lower()
	commands = (
		('Open pending claims', 'Open submitted, under-review, and needs-information claims.', 'rate_review', 'operations_review_queue'),
		('Jump to open reports', 'Review unresolved content reports.', 'flag', 'operations_report_queue'),
		('Catalog health', 'Find business records that need attention.', 'health_and_safety', 'operations_catalog_health'),
		('Businesses missing coordinates', 'Find listings without stored map coordinates.', 'location_off', 'operations_catalog_health?issue=missing_coordinates'),
		('Analytics', 'View feed, signup, campaign, and engagement performance.', 'query_stats', 'operations_analytics'),
		('Audit timeline', 'Review recorded staff operations and edits.', 'history', 'operations_audit_timeline'),
		('Storage and health status', 'Open database, uploads, discovery storage, and catalog health.', 'database', 'operations_storage'),
	)
	results = [
		SearchResult(
			title=title,
			description=description,
			link=reverse(f'happyhour_admin:{view_name.split("?", 1)[0]}') + (f'?{view_name.split("?", 1)[1]}' if '?' in view_name else ''),
			icon=icon,
		)
		for title, description, icon, view_name in commands
		if normalized_term in title.lower() or normalized_term in description.lower()
	]

	if not normalized_term:
		return results

	business_query = (
		Q(name__icontains=search_term)
		| Q(listing_slug__icontains=search_term)
		| Q(phone_number__icontains=search_term)
		| Q(external_id__icontains=search_term)
	)
	for business in ListingSnapshot.objects.filter(business_query).order_by('name', 'pk')[:8]:
		results.append(SearchResult(
			title=f'Business: {business.name}',
			description=f'{business.listing_slug} · {business.phone_number or "No phone"} · {business.external_id or "No external ID"}',
			link=_admin_change_url(business),
			icon='store',
		))

	claimant_matches = (
		BusinessClaim.objects
		.filter(Q(claimant__email__icontains=search_term) | Q(claimant__username__icontains=search_term))
		.select_related('claimant', 'listing_snapshot')
		.order_by('-created_at', '-pk')[:8]
	)
	for claim in claimant_matches:
		results.append(SearchResult(
			title=f'Claimant: {claim.claimant.email or claim.claimant.username}',
			description=f'{claim.listing_snapshot.name} · {claim.get_status_display()}',
			link=_admin_change_url(claim),
			icon='person_search',
		))
	return results


def _get_top_posts(window_start):
	posts = (
		BusinessPost.objects
		.filter(status=BusinessPost.Status.PUBLISHED)
		.select_related('listing_snapshot')
		.annotate(
			impressions_7d=Count(
				'feed_impressions',
				filter=Q(feed_impressions__created_at__gte=window_start),
				distinct=True,
			),
			engagements_7d=Count(
				'feed_engagements',
				filter=Q(feed_engagements__created_at__gte=window_start),
				distinct=True,
			),
		)
		.order_by('-engagements_7d', '-impressions_7d', '-published_at', '-pk')[:8]
	)
	return [
		{
			'post': post,
			'change_url': _admin_change_url(post),
			'impression_count': post.impressions_7d,
			'engagement_count': post.engagements_7d,
			'engagement_rate': _percentage(post.engagements_7d, post.impressions_7d),
		}
		for post in posts
	]


def _get_campaign_performance(reference_time, window_start):
	campaigns = (
		_get_active_campaign_queryset(reference_time)
		.annotate(
			impressions_7d=Count(
				'impressions',
				filter=Q(impressions__created_at__gte=window_start),
				distinct=True,
			),
			clicks_7d=Count(
				'engagements',
				filter=Q(
					engagements__created_at__gte=window_start,
					engagements__event_type=FeedEngagement.EventType.CLICK,
				),
				distinct=True,
			),
		)
		.order_by('-impressions_7d', '-clicks_7d', 'name', 'pk')[:8]
	)
	return [
		{
			'campaign': campaign,
			'change_url': _admin_change_url(campaign),
			'impression_count': campaign.impressions_7d,
			'click_count': campaign.clicks_7d,
			'click_through_rate': _percentage(campaign.clicks_7d, campaign.impressions_7d),
			'remaining_quota': max(campaign.weekly_impression_quota - campaign.impressions_7d, 0),
		}
		for campaign in campaigns
	]


def _get_active_campaign_queryset(reference_time):
	return (
		SponsoredCampaign.objects
		.filter(status=SponsoredCampaign.Status.ACTIVE, starts_at__lte=reference_time)
		.filter(Q(ends_at__isnull=True) | Q(ends_at__gte=reference_time))
		.select_related('membership__claim__listing_snapshot', 'post__listing_snapshot')
	)


def _get_live_location_offline_count(reference_time):
	stale_before = reference_time - timedelta(minutes=LIVE_LOCATION_STALE_AFTER_MINUTES)
	return (
		ListingSnapshot.objects
		.filter(Q(venue_type=VenueType.MOBILE) | Q(serves_multiple_areas=True))
		.filter(business_claims__membership__is_active=True)
		.filter(Q(tracked_location_updated_at__isnull=True) | Q(tracked_location_updated_at__lt=stale_before))
		.distinct()
		.count()
	)


def _get_catalog_attention_count():
	stale_before = timezone.now() - timedelta(days=HEALTH_STALE_AFTER_DAYS)
	return (
		ListingSnapshot.objects
		.filter(
			Q(address_line_1='')
			| Q(website_url='', source_url='')
			| Q(phone_number='')
			| Q(imported_image_urls=[])
			| Q(updated_at__lt=stale_before)
		)
		.distinct()
		.count()
	)


def _daily_counts(queryset, field_name, start_date, days):
	rows = (
		queryset
		.filter(**{f'{field_name}__date__gte': start_date})
		.annotate(day=TruncDate(field_name))
		.values('day')
		.annotate(total=Count('pk'))
	)
	counts_by_day = {row['day']: row['total'] for row in rows}
	return [
		counts_by_day.get(start_date + timedelta(days=offset), 0)
		for offset in range(days)
	]


def _chart_data(start_date, days, series):
	return {
		'labels': [
			(start_date + timedelta(days=offset)).strftime('%b %d')
			for offset in range(days)
		],
		'datasets': [
			{
				'label': label,
				'data': values,
				'borderColor': color,
				'backgroundColor': color,
				'fill': False,
				'tension': 0.35,
				'displayYAxis': True,
			}
			for label, values, color in series
		],
	}


def _percentage(numerator, denominator):
	if not denominator:
		return 0.0
	return round((numerator / denominator) * 100, 1)


def _requires_live_location(snapshot):
	return snapshot.venue_type == VenueType.MOBILE or bool(snapshot.serves_multiple_areas)


def _has_active_membership(snapshot):
	for claim in snapshot.business_claims.all():
		try:
			membership = claim.membership
		except BusinessMembership.DoesNotExist:
			continue
		if membership.is_active:
			return True
	return False


def _admin_change_url(obj, include_unmanaged=False):
	try:
		url = reverse(
			f'happyhour_admin:{obj._meta.app_label}_{obj._meta.model_name}_change',
			args=(obj.pk,),
		)
		if include_unmanaged:
			url = f'{url}?include_unmanaged=1'
		return url
	except NoReverseMatch:
		return ''


def _admin_delete_url(obj, include_unmanaged=False):
	try:
		url = reverse(
			f'happyhour_admin:{obj._meta.app_label}_{obj._meta.model_name}_delete',
			args=(obj.pk,),
		)
		if include_unmanaged:
			url = f'{url}?include_unmanaged=1'
		return url
	except NoReverseMatch:
		return ''


def _audit_object_url_for_content_type(content_type, object_id):
	if content_type is None or not object_id:
		return ''
	try:
		return reverse(
			f'happyhour_admin:{content_type.app_label}_{content_type.model}_change',
			args=(object_id,),
		)
	except NoReverseMatch:
		return ''


def _audit_object_url(entry):
	return _audit_object_url_for_content_type(entry.content_type, entry.object_id)


def _audit_action_label(action_flag):
	return {
		ADDITION: 'Added',
		CHANGE: 'Changed',
		DELETION: 'Deleted',
	}.get(action_flag, 'Updated')


def _get_user_model():
	from django.contrib.auth import get_user_model

	return get_user_model()
