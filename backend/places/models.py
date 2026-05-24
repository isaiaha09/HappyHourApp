from django.conf import settings
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.text import slugify


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
		verbose_name = 'Listing Snapshot'
		verbose_name_plural = 'Listing Snapshots'

	def __str__(self):
		return self.name

	def save(self, *args, **kwargs):
		if not self.listing_slug:
			city_part = self.city or 'unknown'
			self.listing_slug = slugify(f'{self.name}-{city_part}')
		super().save(*args, **kwargs)


class BusinessClaim(models.Model):
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
	job_title = models.CharField(max_length=120)
	work_email = models.EmailField()
	work_phone = models.CharField(max_length=20, blank=True)
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
			for field_name in ['contact_name', 'job_title', 'work_email', 'verification_summary']:
				if not getattr(self, field_name):
					missing_fields.append(field_name)
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
