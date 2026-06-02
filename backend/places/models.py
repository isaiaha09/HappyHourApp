from datetime import timedelta
import hashlib
import io
from pathlib import Path
from urllib.parse import urlparse

from django.conf import settings
from django.contrib.auth.models import User
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone
from django.utils.text import slugify
from pypdf import PdfReader
import pyotp
import secrets

try:
	from PIL import Image, ImageOps
except ImportError:  # pragma: no cover - optional dependency during partial installs
	Image = None
	ImageOps = None

try:
	import pytesseract
	from pytesseract import TesseractNotFoundError
except ImportError:  # pragma: no cover - optional dependency during partial installs
	pytesseract = None
	TesseractNotFoundError = RuntimeError


GENERIC_EMAIL_DOMAINS = {'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'}

DOCUMENT_KIND_EXPECTED_KEYWORDS = {
	'business_registration': {
		'business registration', 'registration', 'license', 'articles', 'incorporation', 'organization', 'llc', 'corporation', 'secretary of state', 'ein', 'tax id', 'seller permit',
	},
	'health_permit': {
		'health permit', 'health', 'permit', 'food facility', 'county', 'public health', 'environmental health', 'sanitation',
	},
	'abc_license': {
		'abc', 'alcohol', 'beverage', 'liquor', 'license', 'type 41', 'type 47',
	},
	'proof_of_address_control': {
		'utility bill', 'lease', 'statement', 'service address', 'billing address', 'property tax', 'rental', 'address',
	},
	'proof_of_authority': {
		'authority', 'authorization', 'owner', 'manager', 'member', 'officer', 'payroll', 'operating agreement', 'employment', 'business card',
	},
}

DOCUMENT_KIND_SUSPICIOUS_KEYWORDS = {
	'baseball', 'basketball', 'football', 'soccer', 'softball', 'transcript', 'resume', 'curriculum vitae', 'cv', 'grade report', 'diploma', 'student record',
}


def _normalize_validation_text(value):
	return ' '.join(str(value or '').replace('_', ' ').replace('-', ' ').lower().split())


def _keyword_hits(text, keywords):
	normalized = _normalize_validation_text(text)
	return sorted(keyword for keyword in keywords if keyword in normalized)


def _extract_printable_text_fallback(file_bytes):
	if not file_bytes:
		return ''
	preview = file_bytes[:200000]
	printable_count = sum(1 for byte in preview if byte in {9, 10, 13} or 32 <= byte <= 126)
	if not preview or (printable_count / len(preview)) < 0.7:
		return ''
	return preview.decode('utf-8', errors='ignore')


def _extract_text_from_pdf_bytes(file_bytes):
	if not file_bytes:
		return ''
	if not file_bytes.lstrip().startswith(b'%PDF'):
		return _extract_printable_text_fallback(file_bytes)
	try:
		reader = PdfReader(io.BytesIO(file_bytes))
	except Exception:
		return _extract_printable_text_fallback(file_bytes)
	text_chunks = []
	for page in reader.pages:
		try:
			text_chunks.append(page.extract_text() or '')
		except Exception:
			continue
	return '\n'.join(chunk for chunk in text_chunks if chunk).strip()


def _extract_text_from_image_bytes(file_bytes):
	if not file_bytes or Image is None or pytesseract is None:
		return ''
	try:
		image = Image.open(io.BytesIO(file_bytes))
		if ImageOps is not None:
			image = ImageOps.grayscale(image)
		return str(pytesseract.image_to_string(image) or '').strip()
	except (OSError, TesseractNotFoundError):
		return ''


def _extract_attachment_validation_text(file_bytes, filename='', content_type=''):
	normalized_name = str(filename or '').strip().lower()
	normalized_type = str(content_type or '').strip().lower()
	if normalized_type == 'application/pdf' or normalized_name.endswith('.pdf'):
		return _extract_text_from_pdf_bytes(file_bytes)
	if normalized_type.startswith('image/') or normalized_name.endswith(('.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff')):
		return _extract_text_from_image_bytes(file_bytes)
	return _extract_printable_text_fallback(file_bytes)


class City(models.TextChoices):
	VENTURA = 'ventura', 'Ventura'
	OXNARD = 'oxnard', 'Oxnard'
	CAMARILLO = 'camarillo', 'Camarillo'


class VenueType(models.TextChoices):
	RESTAURANT = 'restaurant', 'Restaurant'
	FAST_FOOD = 'fast_food', 'Fast Food'
	MOBILE = 'mobile', 'Serves Multiple Locations / Service Area Business'
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
	serves_multiple_areas = models.BooleanField(default=False)
	state = models.CharField(max_length=2, default='CA')
	postal_code = models.CharField(max_length=10, blank=True)
	phone_number = models.CharField(max_length=20, blank=True)
	website_url = models.URLField(blank=True)
	tracked_location_latitude = models.FloatField(null=True, blank=True)
	tracked_location_longitude = models.FloatField(null=True, blank=True)
	tracked_location_accuracy_meters = models.FloatField(null=True, blank=True)
	tracked_location_updated_at = models.DateTimeField(null=True, blank=True)
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
	deleted_from_business_database = models.BooleanField(default=True)
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
	MULTIPLE_AREAS_VALUE = 'multiple_areas'

	class ProfileEntryKind(models.TextChoices):
		SOCIAL_MEDIA_LINK = 'social_media_link', 'Social Media Link'
		OFFER = 'offer', 'Offer'
		OPERATING_HOUR = 'operating_hour', 'Operating Hour'
		PHOTO_REFERENCE = 'photo_reference', 'Photo Reference'

	class Pathway(models.TextChoices):
		CLAIMED = 'claimed', 'Claimed Business'
		ESTABLISHED = 'established', 'Create Business Profile'
		INFORMAL = 'informal', 'Informal Business or Vendor'

	class JobTitle(models.TextChoices):
		OWNER = 'owner', 'Owner'
		MANAGER = 'manager', 'Manager'

	class Status(models.TextChoices):
		DRAFT = 'draft', 'Draft'
		SUBMITTED = 'submitted', 'Submitted'
		UNDER_REVIEW = 'under_review', 'Under Review'
		APPROVED = 'approved', 'Approved'
		REJECTED = 'rejected', 'Rejected'
		NEEDS_INFO = 'needs_info', 'Needs Info'

	class RejectionReason(models.TextChoices):
		BUSINESS_REGISTRATION_INVALID = 'business_registration_invalid', 'Business registration document is invalid, incomplete, or unclear'
		HEALTH_PERMIT_INVALID = 'health_permit_invalid', 'Health permit document is invalid, incomplete, or unclear'
		ABC_LICENSE_INVALID = 'abc_license_invalid', 'ABC license document is invalid, incomplete, or unclear'
		PROOF_OF_AUTHORITY_INVALID = 'proof_of_authority_invalid', 'Proof of authority does not verify the claimant relationship'
		PROOF_OF_ADDRESS_CONTROL_INVALID = 'proof_of_address_control_invalid', 'Address control document is invalid, incomplete, or unclear'
		ADDRESS_INVALID = 'address_invalid', 'Business address is invalid or does not match the claim'
		WORK_EMAIL_UNVERIFIABLE = 'work_email_unverifiable', 'Work email could not be verified against the business'
		WORK_PHONE_UNVERIFIABLE = 'work_phone_unverifiable', 'Work phone could not be verified against the business'
		WEBSITE_INFO_INSUFFICIENT = 'website_info_insufficient', 'Website information is missing, inconsistent, or too limited'
		SOCIAL_LINKS_INSUFFICIENT = 'social_links_insufficient', 'Social media links do not provide enough business verification evidence'
		HOURS_UNCLEAR = 'hours_unclear', 'Hours of operation are incomplete or unclear'
		OFFERS_UNCLEAR = 'offers_unclear', 'Offer or deal descriptions are incomplete or unclear'
		SUPPORTING_DETAILS_INSUFFICIENT = 'supporting_details_insufficient', 'Supporting details do not explain the business clearly enough'
		PHOTOS_UNCLEAR = 'photos_unclear', 'Submitted images or photo references are unclear or not usable for review'
		BUSINESS_IDENTITY_MISMATCH = 'business_identity_mismatch', 'Submitted information does not match the claimed business identity'
		OTHER = 'other_issue', 'Other issue not covered above'

	claimant = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='business_claims', on_delete=models.CASCADE)
	listing_snapshot = models.ForeignKey(ListingSnapshot, related_name='business_claims', on_delete=models.CASCADE)
	pathway = models.CharField(max_length=20, choices=Pathway.choices, default=Pathway.CLAIMED)
	status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
	contact_name = models.CharField(max_length=120)
	job_title = models.CharField(max_length=120, blank=True)
	work_email = models.EmailField()
	work_phone = models.CharField(max_length=20, blank=True)
	employer_address = models.CharField(max_length=255, blank=True)
	address_not_applicable = models.BooleanField(default=False)
	serves_multiple_areas = models.BooleanField(default=False)
	business_website_url = models.URLField(blank=True)
	social_media_links = models.JSONField(default=list, blank=True)
	offer_entries = models.JSONField(default=list, blank=True)
	hours_of_operation_entries = models.JSONField(default=list, blank=True)
	photo_references = models.JSONField(default=list, blank=True)
	verification_documents = models.JSONField(default=dict, blank=True)
	verification_summary = models.TextField(blank=True)
	supporting_details = models.TextField(blank=True)
	verification_score = models.PositiveSmallIntegerField(default=0)
	verification_flags = models.JSONField(default=list, blank=True)
	rejection_reason_codes = models.JSONField(default=list, blank=True)
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
			models.UniqueConstraint(
				fields=['claimant', 'listing_snapshot'],
				condition=~models.Q(status='rejected'),
				name='unique_active_claimant_listing_snapshot_claim',
			),
		]

	def __str__(self):
		return f'{self.listing_snapshot.name} claim by {self.contact_name}'

	@classmethod
	def get_rejection_reason_guidance_map(cls):
		return {
			cls.RejectionReason.BUSINESS_REGISTRATION_INVALID: 'business registration documents adjusted or replaced with clearer, valid copies',
			cls.RejectionReason.HEALTH_PERMIT_INVALID: 'health permit documents adjusted or replaced with clearer, valid copies',
			cls.RejectionReason.ABC_LICENSE_INVALID: 'ABC license documents adjusted or replaced with clearer, valid copies',
			cls.RejectionReason.PROOF_OF_AUTHORITY_INVALID: 'proof of authority documents adjusted or replaced so the claimant relationship is clearly verified',
			cls.RejectionReason.PROOF_OF_ADDRESS_CONTROL_INVALID: 'address control documents adjusted or replaced with clearer, valid copies',
			cls.RejectionReason.ADDRESS_INVALID: 'the business address more accurately explained or corrected',
			cls.RejectionReason.WORK_EMAIL_UNVERIFIABLE: 'a more clearly verifiable work email tied to the business',
			cls.RejectionReason.WORK_PHONE_UNVERIFIABLE: 'a more clearly verifiable work phone tied to the business',
			cls.RejectionReason.WEBSITE_INFO_INSUFFICIENT: 'website details more accurately explained or updated',
			cls.RejectionReason.SOCIAL_LINKS_INSUFFICIENT: 'social links adjusted to point to clearer business ownership or operating evidence',
			cls.RejectionReason.HOURS_UNCLEAR: 'hours text fields adjusted or more accurately explained',
			cls.RejectionReason.OFFERS_UNCLEAR: 'offer text fields adjusted or more accurately explained',
			cls.RejectionReason.SUPPORTING_DETAILS_INSUFFICIENT: 'supporting text fields more accurately explained with clearer business context',
			cls.RejectionReason.PHOTOS_UNCLEAR: 'better images or clearer photo references',
			cls.RejectionReason.BUSINESS_IDENTITY_MISMATCH: 'business identity details corrected so they match the claim and supporting records',
			cls.RejectionReason.OTHER: 'the rejected information corrected based on the reviewer explanation below',
		}

	def get_rejection_reason_labels(self):
		label_map = dict(self.RejectionReason.choices)
		return [label_map[code] for code in self.get_normalized_rejection_reason_codes() if code in label_map]

	def get_normalized_rejection_reason_codes(self):
		valid_codes = set(self.RejectionReason.values)
		return [code for code in list(self.rejection_reason_codes or []) if code in valid_codes]

	def get_reapply_guidance_lines(self):
		guidance_map = self.get_rejection_reason_guidance_map()
		guidance_lines = []
		for code in self.get_normalized_rejection_reason_codes():
			guidance = guidance_map.get(code)
			if guidance and guidance not in guidance_lines:
				guidance_lines.append(guidance)
		return guidance_lines

	def _domain_from_url(self, value):
		normalized = str(value or '').strip()
		if not normalized:
			return ''
		parsed = urlparse(normalized if '://' in normalized else f'https://{normalized}')
		return (parsed.netloc or '').lower().removeprefix('www.')

	def _domain_from_email(self, value):
		normalized = str(value or '').strip().lower()
		if '@' not in normalized:
			return ''
		return normalized.rsplit('@', 1)[1]

	def _has_profile_entry_kind(self, entry_kind):
		if not self.pk:
			return False
		return self.profile_entries.filter(entry_kind=entry_kind).exists()

	def has_authority_attachment(self):
		return self.has_attachment_kind(BusinessClaimAttachment.AttachmentKind.PROOF_OF_AUTHORITY)

	def has_required_regulatory_documentation(self):
		if self.listing_snapshot.venue_type in {VenueType.RESTAURANT, VenueType.FAST_FOOD, VenueType.CAFE}:
			return bool(self.health_permit_documents or self.has_attachment_kind(BusinessClaimAttachment.AttachmentKind.HEALTH_PERMIT))
		if self.listing_snapshot.venue_type == VenueType.BAR:
			return bool(self.abc_license_documents or self.has_attachment_kind(BusinessClaimAttachment.AttachmentKind.ABC_LICENSE))
		return True

	def get_required_attachment_kinds_for_validation(self):
		kinds = [
			BusinessClaimAttachment.AttachmentKind.BUSINESS_REGISTRATION,
			BusinessClaimAttachment.AttachmentKind.PROOF_OF_AUTHORITY,
		]
		if self.listing_snapshot.venue_type in {VenueType.RESTAURANT, VenueType.FAST_FOOD, VenueType.CAFE}:
			kinds.append(BusinessClaimAttachment.AttachmentKind.HEALTH_PERMIT)
		elif self.listing_snapshot.venue_type == VenueType.BAR:
			kinds.append(BusinessClaimAttachment.AttachmentKind.ABC_LICENSE)
		return kinds

	def evaluate_document_evidence(self):
		if self.pathway not in {self.Pathway.CLAIMED, self.Pathway.ESTABLISHED} or not self.pk:
			return {'penalty': 0, 'flags': [], 'blockers': []}

		required_kinds = self.get_required_attachment_kinds_for_validation()
		attachments = list(self.attachments.filter(attachment_kind__in=required_kinds))
		if not attachments:
			return {'penalty': 0, 'flags': [], 'blockers': []}

		penalty = 0
		flags = []
		blockers = []
		analysis_by_kind = {kind: [] for kind in required_kinds}
		digest_to_kinds = {}

		for attachment in attachments:
			analysis = attachment.get_document_validation_analysis()
			analysis_by_kind.setdefault(attachment.attachment_kind, []).append(analysis)
			digest = analysis.get('digest', '')
			if digest:
				digest_to_kinds.setdefault(digest, set()).add(attachment.attachment_kind)

		duplicate_required_digests = [
			kinds for kinds in digest_to_kinds.values()
			if len(kinds) > 1
		]
		if duplicate_required_digests:
			flags.append('reused_same_file_across_required_document_slots')
			blockers.append('reused_same_file_across_required_document_slots')
			penalty += 30

		for attachment_kind, analyses in analysis_by_kind.items():
			if not analyses:
				continue
			has_expected_match = any(analysis['expected_hits'] for analysis in analyses)
			has_suspicious_match = any(analysis['suspicious_hits'] for analysis in analyses)
			if not has_expected_match:
				if has_suspicious_match:
					flags.append(f'{attachment_kind}_document_content_mismatch')
					blockers.append(f'{attachment_kind}_document_content_mismatch')
					penalty += 25
				else:
					flags.append(f'{attachment_kind}_document_low_confidence')
					penalty += 10
			elif has_suspicious_match:
				flags.append(f'{attachment_kind}_document_contains_unrelated_terms')
				penalty += 10

		return {
			'penalty': penalty,
			'flags': sorted(set(flags)),
			'blockers': sorted(set(blockers)),
		}

	def evaluate_verification(self):
		score = 0
		flags = []
		blockers = []

		profile = getattr(self.claimant, 'account_profile', None)
		if profile and profile.email_is_verified:
			score += 10
		else:
			flags.append('email_unverified')

		if self.work_phone:
			score += 5

		website_present = bool(self.business_website_url or self.listing_snapshot.website_url)
		if website_present:
			score += 5

		if self._has_profile_entry_kind(self.ProfileEntryKind.SOCIAL_MEDIA_LINK):
			score += 5

		if self._has_profile_entry_kind(self.ProfileEntryKind.PHOTO_REFERENCE):
			score += 5

		work_email_domain = self._domain_from_email(self.work_email)
		website_domain = self._domain_from_url(self.business_website_url or self.listing_snapshot.website_url)
		if work_email_domain and website_domain:
			if work_email_domain == website_domain:
				score += 15
			else:
				flags.append('work_email_domain_mismatch')
		elif self.pathway in {self.Pathway.CLAIMED, self.Pathway.ESTABLISHED}:
			flags.append('work_email_domain_missing')

		if self.pathway in {self.Pathway.CLAIMED, self.Pathway.ESTABLISHED}:
			if self.business_registration_documents or self.has_attachment_kind(BusinessClaimAttachment.AttachmentKind.BUSINESS_REGISTRATION):
				score += 20
			else:
				blockers.append('missing_business_registration')

			if self.has_authority_attachment():
				score += 15
			else:
				blockers.append('missing_proof_of_authority')

			if self.has_required_regulatory_documentation():
				score += 20
			else:
				blockers.append('missing_required_permit')

			if self.employer_address or self.address_not_applicable:
				score += 10
			else:
				flags.append('business_address_missing')
		else:
			if self.supporting_details.strip():
				score += 10
			else:
				blockers.append('missing_informal_summary')

			has_visible_presence = bool(
				self.business_website_url
				or self._has_profile_entry_kind(self.ProfileEntryKind.SOCIAL_MEDIA_LINK)
				or self._has_profile_entry_kind(self.ProfileEntryKind.PHOTO_REFERENCE)
			)
			if has_visible_presence:
				score += 10
			else:
				blockers.append('missing_informal_presence_signal')

			if self.has_required_regulatory_documentation():
				score += 10
			elif self.listing_snapshot.venue_type in {VenueType.RESTAURANT, VenueType.FAST_FOOD, VenueType.CAFE, VenueType.BAR}:
				flags.append('informal_permit_missing')

		document_verdict = self.evaluate_document_evidence()
		score = max(0, score - document_verdict['penalty'])
		flags.extend(document_verdict['flags'])
		blockers.extend(document_verdict['blockers'])

		if work_email_domain and work_email_domain in GENERIC_EMAIL_DOMAINS:
			flags.append('generic_work_email_domain')
			score = max(0, score - 10)

		return {
			'score': max(0, min(score, 100)),
			'flags': sorted(set(flags + blockers)),
			'blockers': blockers,
		}

	def refresh_verification_state(self, save=True):
		verdict = self.evaluate_verification()
		self.verification_score = verdict['score']
		self.verification_flags = verdict['flags']
		if save and self.pk:
			self.save(update_fields=['verification_score', 'verification_flags', 'updated_at'])
		return verdict

	def get_profile_entry_values(self, entry_kind):
		if not self.pk:
			return []
		return list(
			self.profile_entries.filter(entry_kind=entry_kind)
			.order_by('sort_order', 'id')
			.values_list('value', flat=True)
		)

	def clean(self):
		verdict = self.evaluate_verification()
		self.verification_score = verdict['score']
		self.verification_flags = verdict['flags']
		if self.status in {self.Status.SUBMITTED, self.Status.UNDER_REVIEW, self.Status.APPROVED}:
			missing_fields = []
			for field_name in ['verification_summary']:
				if not getattr(self, field_name):
					missing_fields.append(field_name)

			is_manual_submission = self.listing_snapshot.source_name == self.MANUAL_SOURCE_NAME
			if self.pathway in {self.Pathway.CLAIMED, self.Pathway.ESTABLISHED}:
				for field_name in ['contact_name', 'work_email', 'work_phone']:
					if not getattr(self, field_name):
						missing_fields.append(field_name)
				if not self.address_not_applicable and not self.employer_address:
					missing_fields.append('employer_address')
				if not self.job_title:
					missing_fields.append('job_title')
				if self.job_title and self.job_title not in self.JobTitle.values:
					raise ValidationError('Job title must be Owner or Manager for claimed and established businesses.')
				if not self.business_registration_documents and not self.has_attachment_kind(BusinessClaimAttachment.AttachmentKind.BUSINESS_REGISTRATION):
					raise ValidationError('Business registration documentation is required for claimed and established businesses.')
				if not self.has_authority_attachment():
					raise ValidationError('Proof of authority documentation is required for claimed and established businesses.')
				if self.listing_snapshot.venue_type in {VenueType.RESTAURANT, VenueType.FAST_FOOD, VenueType.CAFE} and not self.health_permit_documents and not self.has_attachment_kind(BusinessClaimAttachment.AttachmentKind.HEALTH_PERMIT):
					raise ValidationError('Health permit documentation is required for food businesses.')
				if self.listing_snapshot.venue_type == VenueType.BAR and not self.abc_license_documents and not self.has_attachment_kind(BusinessClaimAttachment.AttachmentKind.ABC_LICENSE):
					raise ValidationError('ABC license documentation is required for bars.')
			elif self.pathway == self.Pathway.INFORMAL:
				if not self.supporting_details.strip():
					missing_fields.append('supporting_details')
				has_visible_presence = bool(
					self.business_website_url
					or self._has_profile_entry_kind(self.ProfileEntryKind.SOCIAL_MEDIA_LINK)
					or self._has_profile_entry_kind(self.ProfileEntryKind.PHOTO_REFERENCE)
				)
				if not has_visible_presence:
					raise ValidationError('Informal businesses need at least one social link, website, or photo reference before submission.')
			if self.serves_multiple_areas:
				self.address_not_applicable = True
			if not is_manual_submission and self.address_not_applicable:
				raise ValidationError('Address not applicable is only available for manually submitted businesses.')
			if missing_fields:
				raise ValidationError(
					f'Claim is missing required verification fields: {", ".join(missing_fields)}.'
				)

	@property
	def business_registration_documents(self):
		return list((self.verification_documents or {}).get('business_registration', []))

	@property
	def health_permit_documents(self):
		return list((self.verification_documents or {}).get('health_permit', []))

	@property
	def abc_license_documents(self):
		return list((self.verification_documents or {}).get('abc_license', []))

	def has_attachment_kind(self, attachment_kind):
		if not self.pk:
			return False
		return self.attachments.filter(attachment_kind=attachment_kind).exists()

	def submit_for_review(self):
		previous_status = self.status
		previous_submitted_at = self.submitted_at
		self.status = self.Status.SUBMITTED
		if not self.submitted_at:
			self.submitted_at = timezone.now()
		try:
			self.full_clean()
			self.refresh_verification_state(save=False)
			self.save()
		except Exception:
			self.status = previous_status
			self.submitted_at = previous_submitted_at
			raise

	def approve(self, reviewed_by=None, reviewer_notes='', force=False):
		if self.status == self.Status.DRAFT:
			raise ValidationError('Draft claims must be submitted before they can be approved.')

		verdict = self.refresh_verification_state(save=False)
		if verdict['blockers'] and not force:
			raise ValidationError(f'Claim still has verification blockers: {", ".join(verdict["blockers"])}.')

		now = timezone.now()
		self.status = self.Status.APPROVED
		self.rejection_reason_codes = []
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

		from .services.account_profiles import send_business_claim_approved_email

		send_business_claim_approved_email(self.claimant, self)

		return membership

	def reject(self, reviewed_by=None, reviewer_notes=''):
		rejection_reason_codes = self.get_normalized_rejection_reason_codes()
		rejection_notes = str(reviewer_notes or self.reviewer_notes or '').strip()
		if not rejection_reason_codes:
			raise ValidationError('Select at least one structured rejection reason before rejecting a business claim.')
		if self.RejectionReason.OTHER in rejection_reason_codes and not rejection_notes:
			raise ValidationError('Reviewer notes are required when "Other issue not covered above" is selected.')
		self.status = self.Status.REJECTED
		self.reviewed_by = reviewed_by
		self.reviewed_at = timezone.now()
		self.rejection_reason_codes = rejection_reason_codes
		self.reviewer_notes = rejection_notes
		self.save()

		from .services.account_profiles import send_business_claim_rejected_email

		send_business_claim_rejected_email(self.claimant, self)


class BusinessClaimProfileEntry(models.Model):
	claim = models.ForeignKey(BusinessClaim, related_name='profile_entries', on_delete=models.CASCADE)
	entry_kind = models.CharField(max_length=40, choices=BusinessClaim.ProfileEntryKind.choices)
	value = models.TextField()
	sort_order = models.PositiveIntegerField(default=0)
	metadata = models.JSONField(default=dict, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ['entry_kind', 'sort_order', 'id']
		verbose_name = 'Business Claim Profile Entry'
		verbose_name_plural = 'Business Claim Profile Entries'

	def __str__(self):
		return f'{self.claim_id} {self.entry_kind}: {self.value[:40]}'


def business_claim_attachment_upload_to(instance, filename):
	filename_root = Path(filename or 'attachment').stem or 'attachment'
	filename_suffix = Path(filename or '').suffix
	safe_name = slugify(filename_root) or 'attachment'
	return f'business-claim-attachments/{instance.claim_id}/{instance.attachment_kind}/{safe_name}{filename_suffix}'


class BusinessClaimAttachment(models.Model):
	class AttachmentKind(models.TextChoices):
		SOCIAL_MEDIA = 'social_media', 'Social Media Attachment'
		BUSINESS_REGISTRATION = 'business_registration', 'Business Registration Attachment'
		HEALTH_PERMIT = 'health_permit', 'Health Permit Attachment'
		ABC_LICENSE = 'abc_license', 'ABC License Attachment'
		PROOF_OF_ADDRESS_CONTROL = 'proof_of_address_control', 'Proof of Address Control Attachment'
		PROOF_OF_AUTHORITY = 'proof_of_authority', 'Proof of Authority Attachment'

	claim = models.ForeignKey(BusinessClaim, related_name='attachments', on_delete=models.CASCADE)
	attachment_kind = models.CharField(max_length=40, choices=AttachmentKind.choices)
	file = models.FileField(upload_to=business_claim_attachment_upload_to)
	original_filename = models.CharField(max_length=255)
	content_type = models.CharField(max_length=120, blank=True)
	file_size = models.PositiveIntegerField(default=0)
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ['attachment_kind', 'created_at']
		verbose_name = 'Business Claim Attachment'
		verbose_name_plural = 'Business Claim Attachments'

	def __str__(self):
		return f'{self.claim_id} {self.attachment_kind} {self.original_filename}'

	def read_file_bytes(self):
		if not self.file or not self.file.name:
			return b''
		with self.file.storage.open(self.file.name, 'rb') as stored_file:
			return stored_file.read()

	def get_document_validation_analysis(self):
		file_bytes = self.read_file_bytes()
		document_text = _extract_attachment_validation_text(file_bytes, filename=self.original_filename, content_type=self.content_type)
		fallback_text = '' if document_text else _extract_printable_text_fallback(file_bytes)
		combined_text = ' '.join(
			part for part in [self.original_filename, document_text, fallback_text]
			if str(part or '').strip()
		)
		expected_keywords = DOCUMENT_KIND_EXPECTED_KEYWORDS.get(self.attachment_kind, set())
		return {
			'digest': hashlib.sha256(file_bytes).hexdigest() if file_bytes else '',
			'expected_hits': _keyword_hits(combined_text, expected_keywords),
			'suspicious_hits': _keyword_hits(combined_text, DOCUMENT_KIND_SUSPICIOUS_KEYWORDS),
			'document_text': document_text,
		}


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
			.filter(business_claims__isnull=True)
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
	email_verification_code = models.CharField(max_length=6, blank=True)
	email_verification_code_sent_at = models.DateTimeField(null=True, blank=True)
	email_verification_sent_at = models.DateTimeField(null=True, blank=True)
	email_verified_at = models.DateTimeField(null=True, blank=True)
	pending_email = models.EmailField(blank=True)
	previous_verified_email = models.EmailField(blank=True)
	email_change_requested_at = models.DateTimeField(null=True, blank=True)
	business_location_tracking_enabled = models.BooleanField(default=True)
	two_factor_enabled = models.BooleanField(default=False)
	two_factor_secret = models.CharField(max_length=64, blank=True)
	two_factor_pending_secret = models.CharField(max_length=64, blank=True)
	password_reset_token = models.CharField(max_length=64, blank=True)
	password_reset_sent_at = models.DateTimeField(null=True, blank=True)
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

	def issue_email_verification_code(self, force=False):
		if force or not self.email_verification_code:
			self.email_verification_code = f'{secrets.randbelow(1000000):06d}'
			self.email_verification_code_sent_at = timezone.now()
		return self.email_verification_code

	def get_email_verification_code_ttl_seconds(self):
		return max(int(getattr(settings, 'PROFILE_EMAIL_VERIFICATION_CODE_TTL_SECONDS', 60) or 60), 1)

	def get_email_verification_code_expires_at(self):
		if self.email_verification_code_sent_at is None:
			return None
		return self.email_verification_code_sent_at + timedelta(seconds=self.get_email_verification_code_ttl_seconds())

	def get_email_verification_seconds_remaining(self):
		expires_at = self.get_email_verification_code_expires_at()
		if expires_at is None:
			return 0
		remaining = int((expires_at - timezone.now()).total_seconds())
		return max(remaining, 0)

	def email_verification_code_is_active(self):
		return bool(self.email_verification_code) and self.get_email_verification_seconds_remaining() > 0

	def verify_email_verification_code(self, code):
		normalized = ''.join(character for character in str(code or '') if character.isdigit())
		if len(normalized) != 6 or not self.email_verification_code_is_active():
			return False
		return secrets.compare_digest(normalized, self.email_verification_code)

	def clear_email_verification_code(self):
		self.email_verification_code = ''
		self.email_verification_code_sent_at = None

	def get_email_change_revert_timeout(self):
		hours = int(getattr(settings, 'PROFILE_EMAIL_CHANGE_REVERT_HOURS', 24) or 24)
		return timedelta(hours=max(hours, 1))

	def get_email_change_revert_deadline(self):
		if self.email_change_requested_at is None:
			return None
		return self.email_change_requested_at + self.get_email_change_revert_timeout()

	def pending_email_change_is_expired(self):
		deadline = self.get_email_change_revert_deadline()
		if not self.pending_email or not self.previous_verified_email or deadline is None:
			return False
		return timezone.now() >= deadline

	def clear_pending_email_change(self):
		self.pending_email = ''
		self.previous_verified_email = ''
		self.email_change_requested_at = None

	@property
	def email_is_verified(self):
		return self.email_verified_at is not None

	def mark_email_verified(self):
		self.email_verified_at = timezone.now()
		self.email_verification_token = ''
		self.clear_email_verification_code()
		self.clear_pending_email_change()
		self.save(update_fields=['email_verified_at', 'email_verification_token', 'email_verification_code', 'email_verification_code_sent_at', 'pending_email', 'previous_verified_email', 'email_change_requested_at', 'updated_at'])

	def begin_two_factor_setup(self):
		self.two_factor_pending_secret = pyotp.random_base32()
		self.save(update_fields=['two_factor_pending_secret', 'updated_at'])
		return self.two_factor_pending_secret

	def get_two_factor_account_name(self):
		return (self.user.email or self.user.username).strip()

	def get_two_factor_provisioning_uri(self, use_pending=False):
		secret = self.two_factor_pending_secret if use_pending else self.two_factor_secret
		if not secret:
			return ''
		issuer = str(getattr(settings, 'PROFILE_TWO_FACTOR_ISSUER', 'DiningDealz') or 'DiningDealz')
		return pyotp.TOTP(secret).provisioning_uri(name=self.get_two_factor_account_name(), issuer_name=issuer)

	def verify_two_factor_code(self, code, use_pending=False):
		secret = self.two_factor_pending_secret if use_pending else self.two_factor_secret
		normalized = ''.join(character for character in str(code or '') if character.isdigit())
		if not secret or len(normalized) != 6:
			return False
		return pyotp.TOTP(secret).verify(normalized, valid_window=1)

	def enable_two_factor(self):
		if not self.two_factor_pending_secret:
			raise ValidationError('No pending authenticator setup was found.')
		self.two_factor_secret = self.two_factor_pending_secret
		self.two_factor_pending_secret = ''
		self.two_factor_enabled = True
		self.save(update_fields=['two_factor_secret', 'two_factor_pending_secret', 'two_factor_enabled', 'updated_at'])

	def disable_two_factor(self):
		self.two_factor_enabled = False
		self.two_factor_secret = ''
		self.two_factor_pending_secret = ''
		self.save(update_fields=['two_factor_enabled', 'two_factor_secret', 'two_factor_pending_secret', 'updated_at'])

	def issue_password_reset_token(self, force=False):
		if force or not self.password_reset_token:
			self.password_reset_token = secrets.token_urlsafe(32)
		return self.password_reset_token

	def clear_password_reset_token(self):
		self.password_reset_token = ''
		self.password_reset_sent_at = None
		self.save(update_fields=['password_reset_token', 'password_reset_sent_at', 'updated_at'])


class FavoriteBusiness(models.Model):
	user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='favorite_businesses', on_delete=models.CASCADE)
	listing_slug = models.SlugField(max_length=170)
	name = models.CharField(max_length=150)
	city = models.CharField(max_length=20, blank=True)
	city_label = models.CharField(max_length=40, blank=True)
	venue_type = models.CharField(max_length=20, blank=True)
	venue_type_label = models.CharField(max_length=60, blank=True)
	address_line_1 = models.CharField(max_length=255, blank=True)
	website_url = models.URLField(blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	updated_at = models.DateTimeField(auto_now=True)

	class Meta:
		ordering = ['name', 'city_label', '-created_at']
		constraints = [
			models.UniqueConstraint(fields=['user', 'listing_slug'], name='unique_favorite_business_per_user'),
		]

	def __str__(self):
		return f'{self.name} favorite for {self.user.username}'


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
