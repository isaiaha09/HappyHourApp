from django.conf import settings
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.text import slugify
import secrets


class City(models.TextChoices):
	VENTURA = 'ventura', 'Ventura'
	OXNARD = 'oxnard', 'Oxnard'
	CAMARILLO = 'camarillo', 'Camarillo'


class VenueType(models.TextChoices):
	RESTAURANT = 'restaurant', 'Restaurant'
	FAST_FOOD = 'fast_food', 'Fast Food'
	BAR = 'bar', 'Bar'
	CAFE = 'cafe', 'Cafe'
	SHOP = 'shop', 'Shop'
	ATTRACTION = 'attraction', 'Attraction'
	OTHER = 'other', 'Other'


class DealType(models.TextChoices):
	HAPPY_HOUR = 'happy_hour', 'Happy Hour'
	DAILY_SPECIAL = 'daily_special', 'Daily Special'
	DISCOUNT = 'discount', 'Discount'
	LIMITED_TIME = 'limited_time', 'Limited Time'
	OTHER = 'other', 'Other'


class Weekday(models.IntegerChoices):
	MONDAY = 0, 'Monday'
	TUESDAY = 1, 'Tuesday'
	WEDNESDAY = 2, 'Wednesday'
	THURSDAY = 3, 'Thursday'
	FRIDAY = 4, 'Friday'
	SATURDAY = 5, 'Saturday'
	SUNDAY = 6, 'Sunday'


class ListingSnapshot(models.Model):
	source_name = models.CharField(max_length=80, blank=True)
	source_url = models.URLField(blank=True)
	external_id = models.CharField(max_length=150, blank=True)
	listing_slug = models.SlugField(max_length=170, blank=True)
	name = models.CharField(max_length=150)
	city = models.CharField(max_length=20, choices=City.choices, blank=True)
	venue_type = models.CharField(max_length=20, choices=VenueType.choices, blank=True)
	address_line_1 = models.CharField(max_length=255)
	address_line_2 = models.CharField(max_length=255, blank=True)
	neighborhood = models.CharField(max_length=120, blank=True)
	state = models.CharField(max_length=2, default='CA')
	postal_code = models.CharField(max_length=10, blank=True)
	phone_number = models.CharField(max_length=20, blank=True)
	website_url = models.URLField(blank=True)
	captured_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ['name', '-captured_at']
		verbose_name = 'Business'
		verbose_name_plural = 'List of Businesses'

	def __str__(self):
		return self.name

	def save(self, *args, **kwargs):
		if not self.listing_slug:
			city_part = self.city or 'unknown'
			self.listing_slug = slugify(f'{self.name}-{city_part}')
		super().save(*args, **kwargs)


class DeletedBusiness(models.Model):
	source_name = models.CharField(max_length=80, blank=True)
	source_url = models.URLField(blank=True)
	external_id = models.CharField(max_length=150, blank=True)
	listing_slug = models.SlugField(max_length=170, blank=True)
	name = models.CharField(max_length=150)
	city = models.CharField(max_length=20, choices=City.choices, blank=True)
	venue_type = models.CharField(max_length=20, choices=VenueType.choices, blank=True)
	address_line_1 = models.CharField(max_length=255)
	address_line_2 = models.CharField(max_length=255, blank=True)
	neighborhood = models.CharField(max_length=120, blank=True)
	state = models.CharField(max_length=2, default='CA')
	postal_code = models.CharField(max_length=10, blank=True)
	phone_number = models.CharField(max_length=20, blank=True)
	website_url = models.URLField(blank=True)
	payload = models.JSONField(default=dict, blank=True)
	deleted_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ['name', '-deleted_at']
		verbose_name = 'Deleted Business'
		verbose_name_plural = 'Deleted Businesses'

	def __str__(self):
		return self.name

	def save(self, *args, **kwargs):
		if not self.listing_slug:
			city_part = self.city or 'unknown'
			self.listing_slug = slugify(f'{self.name}-{city_part}')
		super().save(*args, **kwargs)


class ProviderUsageWindow(models.Model):
	class WindowKind(models.TextChoices):
		DAY = 'day', 'Day'
		MONTH = 'month', 'Month'

	provider_name = models.CharField(max_length=80)
	window_kind = models.CharField(max_length=10, choices=WindowKind.choices)
	window_start = models.DateField()
	consumed_transactions = models.PositiveIntegerField(default=0)
	transaction_limit = models.PositiveIntegerField(default=0)
	reserve_threshold = models.PositiveIntegerField(default=0)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ['provider_name', '-window_start']
		verbose_name = 'Provider Usage Window'
		verbose_name_plural = 'Provider Usage Windows'
		constraints = [
			models.UniqueConstraint(fields=['provider_name', 'window_kind', 'window_start'], name='unique_provider_usage_window'),
		]

	def __str__(self):
		return f'{self.provider_name} {self.window_kind} {self.window_start}: {self.consumed_transactions}/{self.transaction_limit}'


class BusinessClaim(models.Model):
	MANUAL_SOURCE_NAME = 'manual_submission'

	class Status(models.TextChoices):
		DRAFT = 'draft', 'Draft'
		SUBMITTED = 'submitted', 'Submitted'
		UNDER_REVIEW = 'under_review', 'Under Review'
		APPROVED = 'approved', 'Approved'
		REJECTED = 'rejected', 'Rejected'
		NEEDS_INFO = 'needs_info', 'Needs Info'

	claimant = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='business_claims', on_delete=models.CASCADE)
	listing_snapshot = models.ForeignKey(ListingSnapshot, related_name='business_claims', on_delete=models.CASCADE)
	status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
	contact_name = models.CharField(max_length=120)
	job_title = models.CharField(max_length=120, blank=True)
	work_email = models.EmailField()
	work_phone = models.CharField(max_length=20, blank=True)
	employer_address = models.CharField(max_length=255, blank=True)
	address_not_applicable = models.BooleanField(default=False)
	verification_summary = models.TextField(blank=True)
	supporting_details = models.TextField(blank=True)
	reviewer_notes = models.TextField(blank=True)
	submitted_at = models.DateTimeField(null=True, blank=True)
	reviewed_at = models.DateTimeField(null=True, blank=True)
	reviewed_by = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		related_name='reviewed_business_claims',
		null=True,
		blank=True,
		on_delete=models.SET_NULL,
	)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ['-created_at']
		verbose_name = 'Business Claim'
		verbose_name_plural = 'Business Claims'
		constraints = [
			models.UniqueConstraint(fields=['claimant', 'listing_snapshot'], name='unique_claimant_listing_snapshot_claim'),
		]

	def __str__(self):
		return f'{self.listing_snapshot.name} claim by {self.contact_name}'

	def clean(self):
		if self.status in {self.Status.SUBMITTED, self.Status.UNDER_REVIEW, self.Status.APPROVED}:
			missing_fields = []
			for field_name in ['contact_name', 'work_email', 'verification_summary']:
				if not getattr(self, field_name):
					missing_fields.append(field_name)

			is_manual_submission = self.listing_snapshot.source_name == self.MANUAL_SOURCE_NAME
			if not is_manual_submission and not self.job_title:
				missing_fields.append('job_title')
			if not self.address_not_applicable and not self.employer_address:
				missing_fields.append('employer_address')
			if not is_manual_submission and self.address_not_applicable:
				raise ValidationError('Address not applicable is only available for manually submitted businesses.')
			if missing_fields:
				raise ValidationError(
					f'Claim is missing required verification fields: {", ".join(missing_fields)}.'
				)

	def submit_for_review(self):
		self.full_clean()
		self.status = self.Status.SUBMITTED
		if not self.submitted_at:
			self.submitted_at = timezone.now()
		self.save()

	def approve(self, reviewed_by=None, reviewer_notes=''):
		if self.status == self.Status.DRAFT:
			raise ValidationError('Draft claims must be submitted before they can be approved.')

		now = timezone.now()
		self.status = self.Status.APPROVED
		self.reviewer_notes = reviewer_notes or self.reviewer_notes
		self.reviewed_by = reviewed_by
		self.reviewed_at = now
		if not self.submitted_at:
			self.submitted_at = now
		self.save()

		membership, _ = BusinessMembership.objects.update_or_create(
			claim=self,
			defaults={
				'user': self.claimant,
				'claim': self,
				'approved_by': reviewed_by,
				'approved_at': now,
				'is_active': True,
			},
		)

		return membership

	def reject(self, reviewed_by=None, reviewer_notes=''):
		self.status = self.Status.REJECTED
		self.reviewed_by = reviewed_by
		self.reviewed_at = timezone.now()
		self.reviewer_notes = reviewer_notes or self.reviewer_notes
		self.save()


class BusinessMembership(models.Model):
	user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='business_memberships', on_delete=models.CASCADE)
	claim = models.OneToOneField(BusinessClaim, related_name='membership', on_delete=models.CASCADE)
	approved_by = models.ForeignKey(
		settings.AUTH_USER_MODEL,
		related_name='approved_business_memberships',
		null=True,
		blank=True,
		on_delete=models.SET_NULL,
	)
	approved_at = models.DateTimeField(null=True, blank=True)
	is_active = models.BooleanField(default=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ['claim__listing_snapshot__name', 'user__username']
		verbose_name = 'Business Membership'
		verbose_name_plural = 'Business Memberships'

	def __str__(self):
		return f'{self.user} -> {self.claim.listing_snapshot.name}'


class CustomerAccountManager(models.Manager):
	def get_queryset(self):
		return (
			super()
			.get_queryset()
			.filter(is_staff=False, is_superuser=False)
			.exclude(business_memberships__is_active=True)
			.distinct()
		)


class BusinessAccountManager(models.Manager):
	def get_queryset(self):
		return (
			super()
			.get_queryset()
			.filter(is_staff=False, is_superuser=False)
			.filter(business_memberships__is_active=True)
			.distinct()
		)


class CustomerAccount(User):
	objects = CustomerAccountManager()

	class Meta:
		proxy = True
		verbose_name = 'Customer Account'
		verbose_name_plural = 'Customer Accounts'


class BusinessAccount(User):
	objects = BusinessAccountManager()

	class Meta:
		proxy = True
		verbose_name = 'Business Account'
		verbose_name_plural = 'Business Accounts'


class AccountProfile(models.Model):
	user = models.OneToOneField(settings.AUTH_USER_MODEL, related_name='account_profile', on_delete=models.CASCADE)
	email_verification_token = models.CharField(max_length=64, blank=True)
	email_verification_sent_at = models.DateTimeField(null=True, blank=True)
	email_verified_at = models.DateTimeField(null=True, blank=True)
	two_factor_enabled = models.BooleanField(default=False)
	billing_portal_url = models.URLField(blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ['user__username']
		verbose_name = 'Account Profile'
		verbose_name_plural = 'Account Profiles'

	def __str__(self):
		return f'Profile for {self.user.username}'

	def ensure_verification_token(self, force=False):
		if force or not self.email_verification_token:
			self.email_verification_token = secrets.token_urlsafe(32)
		return self.email_verification_token

	@property
	def email_is_verified(self):
		return self.email_verified_at is not None

	def mark_email_verified(self):
		self.email_verified_at = timezone.now()
		self.email_verification_token = ''
		self.save(update_fields=['email_verified_at', 'email_verification_token', 'updated_at'])


class ProfileAuthToken(models.Model):
	user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='profile_auth_tokens', on_delete=models.CASCADE)
	key = models.CharField(max_length=64, unique=True)
	created_at = models.DateTimeField(auto_now_add=True)
	last_used_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ['-last_used_at']
		verbose_name = 'Profile Auth Token'
		verbose_name_plural = 'Profile Auth Tokens'

	def __str__(self):
		return f'{self.user.username} token'

	def save(self, *args, **kwargs):
		if not self.key:
			self.key = secrets.token_hex(32)
		super().save(*args, **kwargs)
