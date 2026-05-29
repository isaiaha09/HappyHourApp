from urllib.parse import urlparse

from django.contrib import admin, messages
from django.contrib.auth.admin import GroupAdmin, UserAdmin
from django.contrib.auth.models import Group, User
from django.core.exceptions import ValidationError
from django.db.models import Prefetch
from django.http import JsonResponse
from django.http import HttpResponseRedirect
from django.urls import path, reverse
from django.utils.html import format_html
from django.utils.text import slugify
from django.utils import timezone

from .admin_site import happyhour_admin_site
from .models import AccountProfile, BusinessAccount, BusinessClaim, BusinessMembership, CustomerAccount, DeletedBusiness, ListingSnapshot, ProviderUsageWindow
from .services.importers.discovered_json_places import load_discovery_json_records, merge_discovery_json_records, write_discovery_json_records
from .services.deleted_businesses import filter_deleted_business_records, imported_place_from_deleted_business, store_deleted_business
from .services.importers.here_places import HerePlacesImporter
from .services.provider_quota import delete_stale_provider_usage_windows, get_provider_policy, get_provider_usage_statuses, select_discovery_provider
from .services.source_listings import get_listing_source_name, load_source_records


LIVE_DISCOVERY_SOURCE_NAMES = {HerePlacesImporter.source_name}


def _normalize_lookup_text(value):
	return ''.join(character.lower() for character in str(value or '') if character.isalnum())


def _normalized_domain(value):
	parsed = urlparse(str(value or '').strip())
	return str(parsed.netloc or '').strip().lower().removeprefix('www.')


def _build_listing_slug(place_record):
	return str(place_record.profile_slug or '').strip() or slugify(f'{place_record.profile_name or place_record.name}-{place_record.city or "unknown"}')


def _sync_listing_snapshot_from_imported_place(place_record, snapshot=None):
	defaults = {
		'name': place_record.profile_name or place_record.name,
		'city': place_record.city,
		'venue_type': place_record.venue_type,
		'address_line_1': place_record.address_line_1,
		'address_line_2': place_record.address_line_2,
		'neighborhood': place_record.neighborhood,
		'state': place_record.state,
		'postal_code': place_record.postal_code,
		'phone_number': place_record.phone_number,
		'website_url': place_record.website_url,
		'source_name': place_record.source_name,
		'source_url': place_record.source_url or place_record.website_url,
		'external_id': place_record.external_id,
		'listing_slug': _build_listing_slug(place_record),
	}

	if snapshot is not None:
		for field_name, value in defaults.items():
			setattr(snapshot, field_name, value)
		snapshot.save()
		return snapshot

	lookup = {}
	if defaults['source_name'] and defaults['external_id']:
		lookup = {'source_name': defaults['source_name'], 'external_id': defaults['external_id']}
	elif defaults['listing_slug']:
		lookup = {'listing_slug': defaults['listing_slug']}
	else:
		lookup = {
			'name': defaults['name'],
			'city': defaults['city'],
			'address_line_1': defaults['address_line_1'],
		}

	snapshot, _ = ListingSnapshot.objects.update_or_create(**lookup, defaults=defaults)
	return snapshot


def _sync_listing_snapshots_from_imported_places(place_records):
	touched_snapshot_ids = set()
	touched_source_names = set()
	for place_record in place_records:
		snapshot = _sync_listing_snapshot_from_imported_place(place_record)
		touched_snapshot_ids.add(snapshot.pk)
		if str(place_record.source_name or '').strip():
			touched_source_names.add(str(place_record.source_name).strip())

	for source_name in touched_source_names:
		ListingSnapshot.objects.filter(source_name=source_name, business_claims__isnull=True).exclude(pk__in=touched_snapshot_ids).delete()
	return touched_snapshot_ids


def _snapshot_matches_discovery_record(snapshot, place_record):
	if str(snapshot.source_name or '').strip().lower() != str(place_record.source_name or '').strip().lower():
		return False

	snapshot_external_id = str(snapshot.external_id or '').strip().lower()
	place_external_id = str(place_record.external_id or '').strip().lower()
	if snapshot_external_id and place_external_id:
		return snapshot_external_id == place_external_id

	if str(snapshot.city or '').strip().lower() != str(place_record.city or '').strip().lower():
		return False

	snapshot_address = _normalize_lookup_text(snapshot.address_line_1)
	place_address = _normalize_lookup_text(place_record.address_line_1)
	if snapshot_address and place_address and snapshot_address == place_address:
		return True

	snapshot_domain = _normalized_domain(snapshot.website_url)
	place_domain = _normalized_domain(place_record.website_url)
	if snapshot_domain and place_domain and snapshot_domain == place_domain:
		return True

	return _normalize_lookup_text(snapshot.name) == _normalize_lookup_text(place_record.name)


def _remove_discovery_records_for_snapshot(snapshot):
	if str(snapshot.source_name or '').strip().lower() not in LIVE_DISCOVERY_SOURCE_NAMES:
		return []

	existing_records = load_discovery_json_records()
	kept_records = []
	removed_records = []
	for place_record in existing_records:
		if _snapshot_matches_discovery_record(snapshot, place_record):
			removed_records.append(place_record)
			continue
		kept_records.append(place_record)

	if removed_records:
		write_discovery_json_records(kept_records)
	return removed_records


def _delete_snapshot_to_deleted_business(snapshot):
	removed_records = _remove_discovery_records_for_snapshot(snapshot)
	deleted_business = store_deleted_business(snapshot, removed_records=removed_records)
	return deleted_business, removed_records


def _snapshot_match_score(snapshot, place_record):
	score = 0
	if str(snapshot.external_id or '').strip() and str(snapshot.external_id or '').strip().lower() == str(place_record.external_id or '').strip().lower():
		score += 200
	if str(snapshot.city or '').strip().lower() == str(place_record.city or '').strip().lower():
		score += 25

	snapshot_name = _normalize_lookup_text(snapshot.name)
	place_name = _normalize_lookup_text(place_record.name)
	if snapshot_name and place_name:
		if snapshot_name == place_name:
			score += 120
		elif snapshot_name in place_name or place_name in snapshot_name:
			score += 70

	snapshot_address = _normalize_lookup_text(snapshot.address_line_1)
	place_address = _normalize_lookup_text(place_record.address_line_1)
	if snapshot_address and place_address:
		if snapshot_address == place_address:
			score += 90
		elif snapshot_address in place_address or place_address in snapshot_address:
			score += 45

	snapshot_domain = _normalized_domain(snapshot.website_url)
	place_domain = _normalized_domain(place_record.website_url)
	if snapshot_domain and place_domain and snapshot_domain == place_domain:
		score += 60

	return score


def _select_best_matching_record(snapshot, place_records):
	if not place_records:
		return None

	ranked_records = sorted(
		place_records,
		key=lambda place_record: (
			_snapshot_match_score(snapshot, place_record),
			len(str(place_record.address_line_1 or '')),
		),
		reverse=True,
	)
	best_record = ranked_records[0]
	if _snapshot_match_score(snapshot, best_record) < 70:
		return None
	return best_record


class StaffUserAdmin(UserAdmin):
	list_display = ('username', 'email', 'first_name', 'last_name', 'is_staff', 'is_superuser', 'is_active')
	list_filter = ('is_staff', 'is_superuser', 'is_active')
	search_fields = ('username', 'first_name', 'last_name', 'email')

	def changelist_view(self, request, extra_context=None):
		if not request.GET:
			changelist_url = reverse('happyhour_admin:auth_user_changelist')
			return HttpResponseRedirect(f'{changelist_url}?is_staff__exact=1')
		return super().changelist_view(request, extra_context)


happyhour_admin_site.register(User, StaffUserAdmin)
happyhour_admin_site.register(Group, GroupAdmin)


@admin.register(CustomerAccount, site=happyhour_admin_site)
class CustomerAccountAdmin(UserAdmin):
	class AccountPathwayFilter(admin.SimpleListFilter):
		title = 'Account pathway'
		parameter_name = 'account_pathway'

		def lookups(self, request, model_admin):
			return (
				('regular_customer', 'Regular customer'),
				('business_applicant', 'Business applicant'),
				('claim_needs_info', 'Claim needs info'),
			)

		def queryset(self, request, queryset):
			value = self.value()
			if value == 'regular_customer':
				return queryset.filter(business_claims__isnull=True)
			if value == 'business_applicant':
				return queryset.filter(business_claims__isnull=False).exclude(business_claims__status=BusinessClaim.Status.NEEDS_INFO).distinct()
			if value == 'claim_needs_info':
				return queryset.filter(business_claims__status=BusinessClaim.Status.NEEDS_INFO).distinct()
			return queryset

	list_display = (
		'username',
		'email',
		'first_name',
		'last_name',
		'email_verification_status',
		'account_pathway',
		'claim_status',
		'claimed_businesses',
		'is_active',
		'date_joined',
	)
	list_filter = ('is_active', 'date_joined', AccountPathwayFilter, 'business_claims__status')
	search_fields = ('username', 'first_name', 'last_name', 'email')
	ordering = ('-date_joined',)
	readonly_fields = ('date_joined', 'last_login', 'account_pathway', 'claim_status', 'claimed_businesses')
	fieldsets = (
		('Customer account', {
			'fields': ('username', 'password'),
		}),
		('Profile', {
			'fields': ('first_name', 'last_name', 'email'),
		}),
		('Customer or applicant status', {
			'fields': ('account_pathway', 'claim_status', 'claimed_businesses'),
		}),
		('Account status', {
			'fields': ('is_active', 'last_login', 'date_joined'),
		}),
	)
	add_fieldsets = (
		(None, {
			'classes': ('wide',),
			'fields': ('username', 'email', 'password1', 'password2', 'is_active'),
		}),
	)

	def get_queryset(self, request):
		return CustomerAccount.objects.select_related('account_profile').prefetch_related(
			Prefetch('business_claims', queryset=BusinessClaim.objects.select_related('listing_snapshot').order_by('-created_at'))
		)

	@admin.display(boolean=True, description='Verified', ordering='account_profile__email_verified_at')
	def email_verification_status(self, obj):
		try:
			return obj.account_profile.email_is_verified
		except AccountProfile.DoesNotExist:
			return False

	@admin.display(description='Account pathway')
	def account_pathway(self, obj):
		claims = list(obj.business_claims.all())
		if claims:
			return 'Business applicant'
		return 'Regular customer'

	@admin.display(description='Claim status')
	def claim_status(self, obj):
		claims = list(obj.business_claims.all())
		if not claims:
			return 'No claim'

		latest_claim = claims[0]
		status_map = {
			BusinessClaim.Status.DRAFT: 'Draft claim',
			BusinessClaim.Status.SUBMITTED: 'Pending claim',
			BusinessClaim.Status.UNDER_REVIEW: 'Under review',
			BusinessClaim.Status.NEEDS_INFO: 'Needs info',
			BusinessClaim.Status.REJECTED: 'Rejected claim',
			BusinessClaim.Status.APPROVED: 'Approved claim',
		}
		return status_map.get(latest_claim.status, latest_claim.status)

	@admin.display(description='Claimed business')
	def claimed_businesses(self, obj):
		claims = list(obj.business_claims.all())
		if not claims:
			return 'No claimed business'
		return ', '.join(sorted({claim.listing_snapshot.name for claim in claims}))


@admin.register(BusinessAccount, site=happyhour_admin_site)
class BusinessAccountAdmin(UserAdmin):
	list_display = (
		'username',
		'email',
		'first_name',
		'last_name',
		'email_verification_status',
		'business_status',
		'membership_status',
		'claim_count',
		'membership_count',
		'is_active',
	)
	list_filter = ('is_active', 'business_claims__status', 'business_memberships__is_active')
	search_fields = ('username', 'first_name', 'last_name', 'email')
	ordering = ('username',)
	readonly_fields = ('date_joined', 'last_login', 'business_status', 'membership_status', 'claim_count', 'membership_count')
	fieldsets = (
		('Business account', {
			'fields': ('username', 'password'),
		}),
		('Profile', {
			'fields': ('first_name', 'last_name', 'email'),
		}),
		('Business status', {
			'fields': ('business_status', 'membership_status', 'claim_count', 'membership_count', 'is_active', 'last_login', 'date_joined'),
		}),
	)
	add_fieldsets = (
		(None, {
			'classes': ('wide',),
			'fields': ('username', 'email', 'password1', 'password2', 'is_active'),
		}),
	)

	def get_queryset(self, request):
		return BusinessAccount.objects.select_related('account_profile').prefetch_related(
			'business_claims',
			Prefetch('business_memberships', queryset=BusinessMembership.objects.select_related('claim__listing_snapshot')),
		)

	@admin.display(boolean=True, description='Verified', ordering='account_profile__email_verified_at')
	def email_verification_status(self, obj):
		try:
			return obj.account_profile.email_is_verified
		except AccountProfile.DoesNotExist:
			return False

	@admin.display(description='Business status')
	def business_status(self, obj):
		claims = list(obj.business_claims.all())
		memberships = list(obj.business_memberships.all())

		if any(membership.is_active for membership in memberships):
			return 'Approved business'
		if any(claim.status == BusinessClaim.Status.UNDER_REVIEW for claim in claims):
			return 'Under review'
		if any(claim.status == BusinessClaim.Status.SUBMITTED for claim in claims):
			return 'Pending claim'
		if any(claim.status == BusinessClaim.Status.NEEDS_INFO for claim in claims):
			return 'Needs info'
		if any(claim.status == BusinessClaim.Status.REJECTED for claim in claims):
			return 'Rejected claim'
		if any(claim.status == BusinessClaim.Status.DRAFT for claim in claims):
			return 'Draft claim'
		return 'No business claim'

	@admin.display(description='Membership')
	def membership_status(self, obj):
		memberships = list(obj.business_memberships.all())
		if any(membership.is_active for membership in memberships):
			return 'Active membership'
		if memberships:
			return 'No active membership'
		return 'No membership'

	@admin.display(description='Managed businesses')
	def managed_businesses(self, obj):
		memberships = [membership.claim.listing_snapshot.name for membership in obj.business_memberships.all() if membership.is_active]
		if memberships:
			return ', '.join(sorted(memberships))
		return 'No active business'

	@admin.display(description='Claims')
	def claim_count(self, obj):
		return obj.business_claims.count()

	@admin.display(description='Memberships')
	def membership_count(self, obj):
		return obj.business_memberships.count()


@admin.register(ListingSnapshot, site=happyhour_admin_site)
class ListingSnapshotAdmin(admin.ModelAdmin):
	actions = ['pull_all_business_data']
	change_list_template = 'admin/places/listingsnapshot/change_list.html'
	list_display = ('name', 'city', 'venue_type', 'source_name', 'pull_business_data_link', 'captured_at', 'updated_at')
	list_filter = ('city', 'venue_type', 'source_name')
	search_fields = ('name', 'address_line_1', 'external_id', 'website_url')
	readonly_fields = ('captured_at', 'updated_at')
	fieldsets = (
		('Snapshot identity', {
			'fields': ('name', 'listing_slug', 'source_name', 'source_url', 'external_id'),
		}),
		('Business details', {
			'fields': ('city', 'venue_type', 'address_line_1', 'address_line_2', 'neighborhood', 'state', 'postal_code'),
		}),
		('Contact', {
			'fields': ('phone_number', 'website_url'),
		}),
		('Timestamps', {
			'fields': ('captured_at', 'updated_at'),
			'classes': ('collapse',),
		}),
	)

	def get_urls(self):
		custom_urls = [
			path('pull-all-business-data/', self.admin_site.admin_view(self.pull_all_business_data_view), name='places_listingsnapshot_pull_all'),
			path('search-businesses/', self.admin_site.admin_view(self.search_businesses_view), name='places_listingsnapshot_search'),
			path('<path:object_id>/pull-business-data/', self.admin_site.admin_view(self.pull_business_data_view), name='places_listingsnapshot_pull_one'),
		]
		return custom_urls + super().get_urls()

	def changelist_view(self, request, extra_context=None):
		extra_context = extra_context or {}
		extra_context['pull_all_business_data_url'] = reverse('happyhour_admin:places_listingsnapshot_pull_all')
		extra_context['search_businesses_url'] = reverse('happyhour_admin:places_listingsnapshot_search')
		return super().changelist_view(request, extra_context=extra_context)

	@admin.display(description='Pull business data')
	def pull_business_data_link(self, obj):
		url = reverse('happyhour_admin:places_listingsnapshot_pull_one', args=[obj.pk])
		return format_html('<a class="button" href="{}">Pull business data</a>', url)

	@admin.action(description='Pull all business data')
	def pull_all_business_data(self, request, queryset):
		return self._run_pull_all_business_data(request)

	def pull_all_business_data_view(self, request):
		if not self.has_change_permission(request):
			return HttpResponseRedirect(reverse('happyhour_admin:index'))
		return self._run_pull_all_business_data(request)

	def _run_pull_all_business_data(self, request):
		discovery_records = filter_deleted_business_records(list(HerePlacesImporter().load_records()))
		write_discovery_json_records(discovery_records)
		snapshot_records = list(load_source_records(source_name=get_listing_source_name()))
		touched_snapshot_ids = _sync_listing_snapshots_from_imported_places(snapshot_records)
		self.message_user(
			request,
			f'Pulled all business data. Stored {len(discovery_records)} live businesses and synced {len(touched_snapshot_ids)} admin rows.',
			level=messages.SUCCESS,
		)
		return HttpResponseRedirect(reverse('happyhour_admin:places_listingsnapshot_changelist'))

	def search_businesses_view(self, request):
		if not self.has_view_or_change_permission(request):
			return JsonResponse({'results': []}, status=403)

		query = str(request.GET.get('q') or '').strip()
		if not query:
			return JsonResponse({'results': [], 'count': 0})

		queryset = self.get_queryset(request)
		queryset, _use_distinct = self.get_search_results(request, queryset, query)
		queryset = queryset.order_by('name')[:50]

		results = [self._serialize_listing_snapshot_result(snapshot) for snapshot in queryset]
		return JsonResponse({'results': results, 'count': len(results)})

	def _serialize_listing_snapshot_result(self, snapshot):
		return {
			'id': snapshot.pk,
			'name': snapshot.name,
			'city': snapshot.get_city_display() or snapshot.city,
			'venue_type': snapshot.get_venue_type_display() or snapshot.venue_type,
			'source_name': snapshot.source_name,
			'change_url': reverse('happyhour_admin:places_listingsnapshot_change', args=[snapshot.pk]),
			'pull_business_data_url': reverse('happyhour_admin:places_listingsnapshot_pull_one', args=[snapshot.pk]),
			'captured_at': timezone.localtime(snapshot.captured_at).strftime('%b. %d, %Y, %I:%M %p') if snapshot.captured_at else '',
			'updated_at': timezone.localtime(snapshot.updated_at).strftime('%b. %d, %Y, %I:%M %p') if snapshot.updated_at else '',
		}

	def pull_business_data_view(self, request, object_id):
		if not self.has_change_permission(request):
			return HttpResponseRedirect(reverse('happyhour_admin:index'))

		snapshot = self.get_object(request, object_id)
		if snapshot is None:
			self.message_user(request, 'Business row not found.', level=messages.ERROR)
			return HttpResponseRedirect(reverse('happyhour_admin:places_listingsnapshot_changelist'))

		candidate_records = HerePlacesImporter().load_records_for_search(snapshot.name, city=snapshot.city, limit=25)
		best_record = _select_best_matching_record(snapshot, candidate_records)
		if best_record is None:
			self.message_user(request, f'No matching live business data found for {snapshot.name}.', level=messages.WARNING)
			return HttpResponseRedirect(reverse('happyhour_admin:places_listingsnapshot_changelist'))

		merge_discovery_json_records([best_record])
		_sync_listing_snapshot_from_imported_place(best_record, snapshot=snapshot)
		self.message_user(request, f'Pulled business data for {snapshot.name}.', level=messages.SUCCESS)
		return HttpResponseRedirect(reverse('happyhour_admin:places_listingsnapshot_changelist'))

	def delete_model(self, request, obj):
		deleted_business, removed_records = _delete_snapshot_to_deleted_business(obj)
		super().delete_model(request, obj)
		message = f'Moved {obj.name} to Deleted Businesses.'
		if removed_records:
			message += f' Removed {len(removed_records)} live app record(s).'
		self.message_user(request, message, level=messages.SUCCESS)

	def delete_queryset(self, request, queryset):
		removed_count = 0
		moved_count = 0
		for snapshot in queryset:
			_, removed_records = _delete_snapshot_to_deleted_business(snapshot)
			removed_count += len(removed_records)
			moved_count += 1
		super().delete_queryset(request, queryset)
		message = f'Moved {moved_count} business(es) to Deleted Businesses.'
		if removed_count:
			message += f' Removed {removed_count} live app record(s) from the app source.'
		self.message_user(request, message, level=messages.SUCCESS)


@admin.register(DeletedBusiness, site=happyhour_admin_site)
class DeletedBusinessAdmin(admin.ModelAdmin):
	actions = ['restore_selected_businesses']
	list_display = ('name', 'deleted_from_business_database', 'city', 'venue_type', 'source_name', 'restore_business_link', 'deleted_at')
	list_editable = ('deleted_from_business_database',)
	list_filter = ('deleted_from_business_database', 'city', 'venue_type', 'source_name', 'deleted_at')
	search_fields = ('name', 'address_line_1', 'external_id', 'website_url')
	readonly_fields = ('deleted_at', 'updated_at', 'payload')
	fieldsets = (
		('Status', {
			'fields': ('deleted_from_business_database',),
		}),
		('Business identity', {
			'fields': ('name', 'listing_slug', 'source_name', 'source_url', 'external_id'),
		}),
		('Business details', {
			'fields': ('city', 'venue_type', 'address_line_1', 'address_line_2', 'neighborhood', 'state', 'postal_code'),
		}),
		('Contact', {
			'fields': ('phone_number', 'website_url'),
		}),
		('Stored payload', {
			'fields': ('payload',),
			'classes': ('collapse',),
		}),
		('Timestamps', {
			'fields': ('deleted_at', 'updated_at'),
			'classes': ('collapse',),
		}),
	)

	def get_urls(self):
		custom_urls = [
			path('<path:object_id>/restore-business/', self.admin_site.admin_view(self.restore_business_view), name='places_deletedbusiness_restore_one'),
		]
		return custom_urls + super().get_urls()

	@admin.display(description='Restore business')
	def restore_business_link(self, obj):
		url = reverse('happyhour_admin:places_deletedbusiness_restore_one', args=[obj.pk])
		return format_html('<a class="button" href="{}">Restore business</a>', url)

	@admin.action(description='Restore selected businesses')
	def restore_selected_businesses(self, request, queryset):
		restored_count = 0
		for deleted_business in list(queryset):
			self._restore_deleted_business(deleted_business)
			restored_count += 1
		self.message_user(request, f'Restored {restored_count} business(es).', level=messages.SUCCESS)

	def restore_business_view(self, request, object_id):
		if not self.has_change_permission(request):
			return HttpResponseRedirect(reverse('happyhour_admin:index'))

		deleted_business = self.get_object(request, object_id)
		if deleted_business is None:
			self.message_user(request, 'Deleted business not found.', level=messages.ERROR)
			return HttpResponseRedirect(reverse('happyhour_admin:places_deletedbusiness_changelist'))

		self._restore_deleted_business(deleted_business)
		self.message_user(request, f'Restored {deleted_business.name}.', level=messages.SUCCESS)
		return HttpResponseRedirect(reverse('happyhour_admin:places_deletedbusiness_changelist'))

	def _restore_deleted_business(self, deleted_business):
		place_record = imported_place_from_deleted_business(deleted_business)
		if str(place_record.source_name or '').strip().lower() in LIVE_DISCOVERY_SOURCE_NAMES:
			merge_discovery_json_records([place_record])
		_sync_listing_snapshot_from_imported_place(place_record)
		deleted_business.delete()


@admin.register(BusinessClaim, site=happyhour_admin_site)
class BusinessClaimAdmin(admin.ModelAdmin):
	actions = ['mark_under_review', 'approve_selected_claims', 'reject_selected_claims']
	list_display = ('listing_snapshot', 'contact_name', 'claimant', 'status', 'work_email', 'submitted_at', 'reviewed_at')
	list_filter = ('status', 'listing_snapshot__city')
	search_fields = ('listing_snapshot__name', 'contact_name', 'claimant__username', 'work_email')
	readonly_fields = ('submitted_at', 'reviewed_at', 'reviewed_by', 'created_at', 'updated_at')
	autocomplete_fields = ('claimant', 'listing_snapshot', 'reviewed_by')
	list_select_related = ('listing_snapshot', 'claimant', 'reviewed_by')
	list_per_page = 25
	fieldsets = (
		('Claim status', {
			'fields': ('status', 'listing_snapshot', 'claimant'),
		}),
		('Business contact', {
			'fields': ('contact_name', 'job_title', 'work_email', 'work_phone', 'employer_address', 'address_not_applicable'),
		}),
		('Verification details', {
			'fields': ('verification_summary', 'supporting_details'),
			'description': 'These are the materials submitted by the business claimant for review.',
		}),
		('Admin review', {
			'fields': ('reviewer_notes', 'reviewed_by', 'reviewed_at'),
			'description': 'Use admin actions to mark claims under review, approve them, or reject them.',
		}),
		('Timestamps', {
			'fields': ('submitted_at', 'created_at', 'updated_at'),
			'classes': ('collapse',),
		}),
	)

	@admin.action(description='Mark selected claims under review')
	def mark_under_review(self, request, queryset):
		updated = queryset.exclude(status=BusinessClaim.Status.APPROVED).update(status=BusinessClaim.Status.UNDER_REVIEW)
		self.message_user(request, f'{updated} claim(s) marked under review.')

	@admin.action(description='Approve selected claims and create memberships')
	def approve_selected_claims(self, request, queryset):
		approved = 0
		for claim in queryset:
			try:
				claim.approve(reviewed_by=request.user)
				approved += 1
			except ValidationError as error:
				self.message_user(request, f'Could not approve {claim}: {error}', level='ERROR')
		self.message_user(request, f'{approved} claim(s) approved.')

	@admin.action(description='Reject selected claims')
	def reject_selected_claims(self, request, queryset):
		for claim in queryset:
			claim.reject(reviewed_by=request.user)
		self.message_user(request, f'{queryset.count()} claim(s) rejected.')

	def save_model(self, request, obj, form, change):
		if obj.status == BusinessClaim.Status.UNDER_REVIEW and not obj.reviewed_by:
			obj.reviewed_by = request.user
		super().save_model(request, obj, form, change)


@admin.register(BusinessMembership, site=happyhour_admin_site)
class BusinessMembershipAdmin(admin.ModelAdmin):
	list_display = ('user', 'business_name', 'approved_at', 'approved_by', 'is_active')
	list_filter = ('is_active', 'claim__listing_snapshot__city')
	search_fields = ('user__username', 'claim__listing_snapshot__name')
	autocomplete_fields = ('user', 'claim', 'approved_by')
	list_select_related = ('user', 'claim', 'claim__listing_snapshot', 'approved_by')
	readonly_fields = ('business_name', 'approved_at', 'created_at', 'updated_at')
	fieldsets = (
		('Membership', {
			'fields': ('user', 'claim', 'business_name', 'is_active'),
		}),
		('Approval source', {
			'fields': ('approved_by', 'approved_at'),
		}),
		('Timestamps', {
			'fields': ('created_at', 'updated_at'),
			'classes': ('collapse',),
		}),
	)

	@admin.display(description='Business')
	def business_name(self, obj):
		return obj.claim.listing_snapshot.name


@admin.register(ProviderUsageWindow, site=happyhour_admin_site)
class ProviderUsageWindowAdmin(admin.ModelAdmin):
	list_display = (
		'provider_name',
		'window_kind',
		'window_start',
		'consumed_transactions',
		'transaction_limit',
		'reserve_threshold',
		'remaining_transactions',
		'remaining_before_reserve',
		'is_available',
		'is_current_provider',
		'updated_at',
	)
	list_filter = ('provider_name', 'window_kind', 'window_start')
	search_fields = ('provider_name',)
	readonly_fields = (
		'provider_name',
		'window_kind',
		'window_start',
		'consumed_transactions',
		'transaction_limit',
		'reserve_threshold',
		'created_at',
		'updated_at',
		'remaining_transactions',
		'remaining_before_reserve',
		'is_available',
		'is_current_provider',
	)
	ordering = ('provider_name', '-window_start')

	def get_queryset(self, request):
		delete_stale_provider_usage_windows()
		get_provider_usage_statuses()
		return super().get_queryset(request)

	@admin.display(description='Remaining Transactions')
	def remaining_transactions(self, obj):
		return max(0, obj.transaction_limit - obj.consumed_transactions)

	@admin.display(description='Remaining Before Reserve')
	def remaining_before_reserve(self, obj):
		return max(0, (obj.transaction_limit - obj.reserve_threshold) - obj.consumed_transactions)

	@admin.display(boolean=True, description='Available')
	def is_available(self, obj):
		policy = get_provider_policy(obj.provider_name)
		if policy is None or not policy.api_key:
			return False
		return obj.consumed_transactions < max(0, obj.transaction_limit - obj.reserve_threshold)

	@admin.display(boolean=True, description='Current Provider')
	def is_current_provider(self, obj):
		return obj.provider_name == select_discovery_provider()
