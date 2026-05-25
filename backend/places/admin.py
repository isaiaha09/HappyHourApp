from django.contrib import admin
from django.contrib.auth.admin import GroupAdmin, UserAdmin
from django.contrib.auth.models import Group, User
from django.db.models import Prefetch
from django.core.exceptions import ValidationError
from django.http import HttpResponseRedirect
from django.urls import reverse

from .admin_site import happyhour_admin_site
from .models import BusinessAccount, BusinessClaim, BusinessMembership, CustomerAccount, ListingSnapshot


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
		return CustomerAccount.objects.prefetch_related(
			Prefetch('business_claims', queryset=BusinessClaim.objects.select_related('listing_snapshot').order_by('-created_at'))
		)

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
		return BusinessAccount.objects.prefetch_related(
			'business_claims',
			Prefetch('business_memberships', queryset=BusinessMembership.objects.select_related('claim__listing_snapshot')),
		)

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
	list_display = ('name', 'city', 'venue_type', 'source_name', 'captured_at')
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
