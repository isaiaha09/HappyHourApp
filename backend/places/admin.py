import ast
from dataclasses import replace
import json
import re
from urllib.parse import urlparse

from django import forms
from django.contrib import admin, messages
from django.contrib.auth.admin import GroupAdmin, UserAdmin
from django.contrib.auth.models import Group, User
from django.core.exceptions import ValidationError
from django.db.models import Exists, OuterRef, Prefetch, Q, Subquery
from django.http import JsonResponse
from django.http import HttpResponseRedirect
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils.html import format_html, format_html_join
from django.utils.text import slugify
from django.utils import timezone

from .admin_site import happyhour_admin_site
from .models import AccountProfile, BusinessAccount, BusinessClaim, BusinessClaimAttachment, BusinessClaimProfileEntry, BusinessMembership, CustomerAccount, DealType, DeletedBusiness, ListingSnapshot, ProviderUsageWindow, Weekday
from .services.business_profile_overrides import format_operating_hour_display, format_time_display, is_open_24_hours_row, normalize_deal_overrides, normalize_operating_hour_overrides, normalize_time_value, summarize_deal_overrides, summarize_operating_hour_overrides
from .services.importers.discovered_json_places import load_discovery_json_records, merge_discovery_json_records, write_discovery_json_records
from .services.deleted_businesses import filter_deleted_business_records, imported_place_from_deleted_business, store_deleted_business
from .services.importers.business_websites import BusinessWebsiteImporter
from .services.importers.here_places import HerePlacesImporter
from .services.provider_quota import delete_stale_provider_usage_windows, get_provider_policy, get_provider_usage_statuses, select_discovery_provider
from .services.social_profiles import build_social_media_links, normalize_business_contact_channels, normalize_social_profile
from .services.source_listings import get_listing_source_name, get_source_place_payload, get_source_place_payloads, load_canonical_source_records, load_source_records


LIVE_DISCOVERY_SOURCE_NAMES = {HerePlacesImporter.source_name}
PLAIN_TEXT_HOUR_LINE_PATTERN = re.compile(r'^(?P<weekday>[A-Za-z]+)\s*:?\s*(?P<open>.+?)\s*-\s*(?P<close>.+)$')
PLAIN_TEXT_HAPPY_HOUR_LINE_PATTERN = re.compile(r'^(?P<weekday>[A-Za-z]+)\s*:?\s*(?P<time_range>all\s+day|.+?)$', re.IGNORECASE)

VERIFICATION_BLOCKER_LABELS = {
	'missing_required_permit': 'Required permit documentation is still missing.',
	'missing_informal_summary': 'Supporting details for the small startup or vendor are still missing.',
	'missing_informal_presence_signal': 'The claim still needs a website, social link, or photo reference.',
	'reused_same_file_across_required_document_slots': 'The same file was reused across multiple required document slots.',
}


def _format_verification_blocker(blocker_code):
	if blocker_code in VERIFICATION_BLOCKER_LABELS:
		return VERIFICATION_BLOCKER_LABELS[blocker_code]
	return f'{str(blocker_code or "").replace("_", " ").capitalize()}.'


def _json_text_for_admin(value):
	if value in (None, [], {}):
		return ''
	return json.dumps(value, indent=2)


def _normalize_admin_string_list(value):
	if value is None or value == '':
		return []
	if isinstance(value, str):
		items = value.splitlines()
	else:
		items = list(value)
	normalized_items = []
	seen_items = set()
	for item in items:
		normalized_item = str(item or '').strip()
		if not normalized_item or normalized_item in seen_items:
			continue
		normalized_items.append(normalized_item)
		seen_items.add(normalized_item)
	return normalized_items


def _coerce_imported_image_url_input(raw_value):
	normalized = str(raw_value or '').strip()
	if not normalized or normalized.lower() in {'null', 'none'}:
		return []

	try:
		parsed = json.loads(normalized)
	except json.JSONDecodeError:
		parsed = None
	if parsed is not None:
		if not isinstance(parsed, list):
			raise ValueError('Enter imported image URLs as one URL per line or as a JSON array of URLs.')
		return _normalize_admin_string_list(parsed)

	if normalized.startswith(('[', '{')):
		literal_value = _literal_json_like_parse(normalized)
		if literal_value is not None:
			if not isinstance(literal_value, list):
				raise ValueError('Enter imported image URLs as one URL per line or as a JSON array of URLs.')
			return _normalize_admin_string_list(literal_value)

	return _normalize_admin_string_list(normalized)


def _filter_suppressed_imported_image_urls(snapshot, image_urls):
	suppressed_image_urls = set(_normalize_admin_string_list(getattr(snapshot, 'suppressed_imported_image_urls', [])))
	if not suppressed_image_urls:
		return _normalize_admin_string_list(image_urls)
	return [image_url for image_url in _normalize_admin_string_list(image_urls) if image_url not in suppressed_image_urls]


def _deal_override_text_for_admin(value):
	if value in (None, [], {}):
		return ''
	sections = []
	for deal in value:
		lines = [f"Title: {deal.get('title', '')}"]
		deal_type = str(deal.get('deal_type') or '').strip()
		custom_deal_type_label = str(deal.get('custom_deal_type_label') or '').strip()
		if deal_type:
			try:
				resolved_type_label = custom_deal_type_label or DealType(deal_type).label
				lines.append(f"Type: {resolved_type_label}")
			except ValueError:
				lines.append(f"Type: {custom_deal_type_label or deal_type}")
		if deal.get('price_text'):
			lines.append(f"Price: {deal['price_text']}")
		if deal.get('description'):
			lines.append(f"Description: {deal['description']}")
		if deal.get('terms'):
			lines.append(f"Terms: {deal['terms']}")
		for happy_hour in deal.get('happy_hours', []):
			weekday_label = Weekday(happy_hour['weekday']).label
			if happy_hour.get('all_day'):
				lines.append(f"Happy hour: {weekday_label} all day")
			else:
				lines.append(
					f"Happy hour: {weekday_label} {format_time_display(happy_hour['start_time'])} - {format_time_display(happy_hour['end_time'])}"
				)
		sections.append('\n'.join(lines))
	return '\n\n'.join(sections)


def _custom_deal_type_label_from_public_payload(deal):
	deal_type_label = str(deal.get('deal_type_label') or '').strip()
	if not deal_type_label:
		return ''
	if deal_type_label.lower() == DealType.OTHER.label.lower():
		return ''
	return deal_type_label


def _deal_override_seed_from_public_payload(payload):
	deals = list((payload or {}).get('deals', []))
	return [
		{
			'title': deal.get('title', ''),
			'description': deal.get('description', ''),
			'deal_type': deal.get('deal_type', DealType.OTHER),
			'custom_deal_type_label': _custom_deal_type_label_from_public_payload(deal),
			'price_text': deal.get('price_text', ''),
			'terms': deal.get('terms', ''),
			'happy_hours': [
				{
					'weekday': window.get('weekday'),
					'start_time': window.get('start_time', ''),
					'end_time': window.get('end_time', ''),
					'all_day': bool(window.get('all_day')),
				}
				for window in deal.get('happy_hours', [])
			],
		}
		for deal in deals
	]


def _operating_hour_override_seed_from_public_payload(payload):
	operating_hours = list((payload or {}).get('operating_hours', []))
	return [
		{
			'weekday': row.get('weekday'),
			'open_time': row.get('open_time', ''),
			'close_time': row.get('close_time', ''),
			'open_24_hours': bool(row.get('open_24_hours')),
			'group_id': row.get('group_id'),
			'group_rank': row.get('group_rank'),
		}
		for row in operating_hours
	]


def _format_public_deals_preview_lines(deals):
	preview_lines = []
	for deal in deals:
		happy_hour_windows = deal.get('happy_hours', [])
		hour_labels = []
		for window in happy_hour_windows:
			window_range = 'all day' if window.get('all_day') else f"{format_time_display(window.get('start_time'))} - {format_time_display(window.get('end_time'))}"
			hour_labels.append(f"{window.get('weekday_label', window.get('weekday'))}: {window_range}")
		hours_label = ', '.join(hour_labels) if hour_labels else 'No time windows parsed'
		line_parts = [deal.get('title', 'Untitled deal')]
		if deal.get('price_text'):
			line_parts.append(str(deal['price_text']))
		if deal.get('terms'):
			line_parts.append(f"Terms: {deal['terms']}")
		line_parts.append(hours_label)
		preview_lines.append(' | '.join(part for part in line_parts if part))
	return preview_lines


def _format_public_hours_preview_lines(operating_hours):
	return [
		f"{row.get('weekday_label', row.get('weekday'))}: {format_operating_hour_display(row)}"
		for row in operating_hours
	]


class ManagedByBusinessUserFilter(admin.SimpleListFilter):
	title = 'Managed by business user'
	parameter_name = 'managed_by_business_user'

	def lookups(self, request, model_admin):
		return (
			('yes', 'Managed'),
			('no', 'Not managed'),
		)

	def queryset(self, request, queryset):
		value = self.value()
		if value == 'yes':
			return queryset.filter(business_claims__membership__is_active=True).distinct()
		if value == 'no':
			return queryset.exclude(business_claims__membership__is_active=True).distinct()
		return queryset


class HasImportedImagesFilter(admin.SimpleListFilter):
	title = 'Has images'
	parameter_name = 'has_images'

	def lookups(self, request, model_admin):
		return (
			('yes', 'Has at least 1 image'),
			('no', 'No images'),
		)

	def queryset(self, request, queryset):
		value = self.value()
		if value == 'yes':
			return queryset.exclude(imported_image_urls=[])
		if value == 'no':
			return queryset.filter(imported_image_urls=[])
		return queryset


def _operating_hour_override_text_for_admin(value):
	if value in (None, [], {}):
		return ''
	return '\n'.join(
		f"{Weekday(row['weekday']).label}: {format_operating_hour_display(row)}"
		for row in value
	)


def _literal_json_like_parse(raw_value):
	try:
		parsed = ast.literal_eval(raw_value)
	except (ValueError, SyntaxError):
		return None
	return parsed


def _coerce_deal_override_input(raw_value):
	normalized = str(raw_value or '').strip()
	if not normalized or normalized.lower() in {'null', 'none'}:
		return None

	try:
		return normalize_deal_overrides(json.loads(normalized))
	except json.JSONDecodeError:
		pass

	if normalized.startswith(('[', '{')):
		literal_value = _literal_json_like_parse(normalized)
		if literal_value is not None:
			return normalize_deal_overrides(literal_value)

	blocks = []
	current_lines = []
	for line in normalized.splitlines():
		cleaned_line = str(line or '').strip()
		if cleaned_line:
			current_lines.append(cleaned_line)
			continue
		if current_lines:
			blocks.append(current_lines)
			current_lines = []
	if current_lines:
		blocks.append(current_lines)

	parsed_overrides = []
	for lines in blocks:
		title = ''
		price_text = ''
		description_lines = []
		terms = ''
		deal_type = DealType.OTHER
		custom_deal_type_label = ''
		happy_hours = []
		for line_index, line in enumerate(lines, start=1):
			lowered = line.lower()
			if lowered.startswith('title:'):
				title = line.split(':', 1)[1].strip()
			elif lowered.startswith('type:'):
				raw_type_label = line.split(':', 1)[1].strip()
				raw_type = raw_type_label.lower().replace(' ', '_')
				if raw_type in DealType.values:
					deal_type = raw_type or DealType.OTHER
					custom_deal_type_label = ''
				else:
					deal_type = DealType.OTHER
					custom_deal_type_label = raw_type_label
			elif lowered.startswith('price:'):
				price_text = line.split(':', 1)[1].strip()
			elif lowered.startswith('description:'):
				description_lines.append(line.split(':', 1)[1].strip())
			elif lowered.startswith('terms:'):
				terms = line.split(':', 1)[1].strip()
			elif lowered.startswith('happy hour:'):
				happy_hours.append(_parse_admin_happy_hour_line(line.split(':', 1)[1].strip()))
			elif not title:
				title = line
			elif not price_text and line_index == 2:
				price_text = line
			else:
				description_lines.append(line)
		parsed_overrides.append({
			'title': title,
			'description': ' '.join(description_lines),
			'deal_type': deal_type,
			'custom_deal_type_label': custom_deal_type_label,
			'price_text': price_text,
			'terms': terms,
			'happy_hours': happy_hours,
		})

	if not parsed_overrides:
		raise ValueError('Enter deal overrides as valid JSON or plain text blocks with title, optional price, and optional description lines.')

	return normalize_deal_overrides(parsed_overrides)


def _weekday_value_from_admin_text(raw_value):
	normalized = str(raw_value or '').strip().lower().rstrip(':')
	weekday_map = {
		'mon': Weekday.MONDAY,
		'monday': Weekday.MONDAY,
		'tue': Weekday.TUESDAY,
		'tues': Weekday.TUESDAY,
		'tuesday': Weekday.TUESDAY,
		'wed': Weekday.WEDNESDAY,
		'wednesday': Weekday.WEDNESDAY,
		'thu': Weekday.THURSDAY,
		'thur': Weekday.THURSDAY,
		'thurs': Weekday.THURSDAY,
		'thursday': Weekday.THURSDAY,
		'fri': Weekday.FRIDAY,
		'friday': Weekday.FRIDAY,
		'sat': Weekday.SATURDAY,
		'saturday': Weekday.SATURDAY,
		'sun': Weekday.SUNDAY,
		'sunday': Weekday.SUNDAY,
	}
	weekday_value = weekday_map.get(normalized)
	if weekday_value is None:
		raise ValueError('Use a weekday name like Monday or Mon for operating hour overrides.')
	return weekday_value


def _parse_admin_happy_hour_line(raw_value):
	match = PLAIN_TEXT_HAPPY_HOUR_LINE_PATTERN.match(str(raw_value or '').strip())
	if not match:
		raise ValueError('Use happy-hour lines like "Happy hour: Monday 3:00 PM - 6:00 PM" or "Happy hour: Friday all day".')
	weekday = _weekday_value_from_admin_text(match.group('weekday'))
	time_range = str(match.group('time_range') or '').strip()
	if re.fullmatch(r'all\s+day', time_range, re.IGNORECASE):
		return {
			'weekday': weekday,
			'start_time': '00:00',
			'end_time': '23:59',
			'all_day': True,
		}
	parts = [part.strip() for part in time_range.split('-', 1)]
	if len(parts) != 2:
		raise ValueError('Use happy-hour lines like "Happy hour: Monday 3:00 PM - 6:00 PM" or "Happy hour: Friday all day".')
	return {
		'weekday': weekday,
		'start_time': normalize_time_value(parts[0], 'Happy hour start time'),
		'end_time': normalize_time_value(parts[1], 'Happy hour end time'),
		'all_day': False,
	}


def _coerce_operating_hour_override_input(raw_value):
	normalized = str(raw_value or '').strip()
	if not normalized or normalized.lower() in {'null', 'none'}:
		return None

	try:
		return normalize_operating_hour_overrides(json.loads(normalized))
	except json.JSONDecodeError:
		pass

	if normalized.startswith(('[', '{')):
		literal_value = _literal_json_like_parse(normalized)
		if literal_value is not None:
			return normalize_operating_hour_overrides(literal_value)

	parsed_rows = []
	for line in normalized.splitlines():
		cleaned_line = str(line or '').strip()
		if not cleaned_line:
			continue
		if ':' in cleaned_line:
			weekday_text, remainder = cleaned_line.split(':', 1)
			if str(remainder or '').strip().lower() in {'open 24 hours', 'open 24 hrs'}:
				parsed_rows.append({
					'weekday': _weekday_value_from_admin_text(weekday_text),
					'open_24_hours': True,
				})
				continue
		match = PLAIN_TEXT_HOUR_LINE_PATTERN.match(cleaned_line)
		if not match:
			raise ValueError('Enter operating hour overrides as valid JSON or one line per day like Monday: 11:00 AM - 9:00 PM or Monday: Open 24 hours.')
		parsed_rows.append({
			'weekday': _weekday_value_from_admin_text(match.group('weekday')),
			'open_time': normalize_time_value(match.group('open').strip(), 'Operating hour open time'),
			'close_time': normalize_time_value(match.group('close').strip(), 'Operating hour close time'),
		})

	if not parsed_rows:
		raise ValueError('Enter operating hour overrides as valid JSON or one line per day like Monday: 11:00 AM - 9:00 PM or Monday: Open 24 hours.')

	return normalize_operating_hour_overrides(parsed_rows)


class BusinessClaimAdminForm(forms.ModelForm):
	rejection_reason_codes = forms.MultipleChoiceField(
		label='Rejection Reasons',
		required=False,
		choices=BusinessClaim.RejectionReason.choices,
		widget=forms.CheckboxSelectMultiple(attrs={'class': 'rejection-reasons-list'}),
		help_text='Select every document, field, address, or evidence issue that applies when rejecting this claim.',
	)

	class Meta:
		model = BusinessClaim
		fields = '__all__'

	class Media:
		css = {
			'all': ('places/admin/business_claim_admin.css',),
		}

	def __init__(self, *args, **kwargs):
		super().__init__(*args, **kwargs)
		self.fields['rejection_reason_codes'].initial = self.instance.get_normalized_rejection_reason_codes() if self.instance.pk else []

	def clean_rejection_reason_codes(self):
		selected_codes = list(self.cleaned_data.get('rejection_reason_codes') or [])
		valid_codes = set(BusinessClaim.RejectionReason.values)
		return [code for code in selected_codes if code in valid_codes]

	def clean(self):
		cleaned_data = super().clean()
		status_value = cleaned_data.get('status')
		selected_codes = cleaned_data.get('rejection_reason_codes') or []
		reviewer_notes = str(cleaned_data.get('reviewer_notes') or '').strip()
		if status_value == BusinessClaim.Status.REJECTED:
			if not selected_codes:
				raise forms.ValidationError('Select at least one rejection reason before rejecting this claim.')
			if BusinessClaim.RejectionReason.OTHER in selected_codes and not reviewer_notes:
				raise forms.ValidationError('Add reviewer notes when you select "Other issue not covered above."')
		return cleaned_data

	def save(self, commit=True):
		self.instance.rejection_reason_codes = self.cleaned_data.get('rejection_reason_codes') or []
		return super().save(commit=commit)


class ListingSnapshotAdminForm(forms.ModelForm):
	imported_image_urls = forms.CharField(required=False, widget=forms.Textarea(attrs={'rows': 5}))
	deal_overrides = forms.CharField(required=False, widget=forms.Textarea(attrs={'rows': 8}))
	deal_overrides_touched = forms.BooleanField(required=False, widget=forms.HiddenInput())
	operating_hour_overrides = forms.CharField(required=False, widget=forms.Textarea(attrs={'rows': 6}))
	operating_hour_overrides_touched = forms.BooleanField(required=False, widget=forms.HiddenInput())
	instagram_url = forms.CharField(required=False)
	facebook_url = forms.CharField(required=False)
	tiktok_url = forms.CharField(required=False)
	youtube_url = forms.CharField(required=False)

	class Media:
		css = {
			'all': ('places/admin/listingsnapshot_structured_overrides.css',),
		}
		js = ('places/admin/listingsnapshot_structured_overrides.js',)

	class Meta:
		model = ListingSnapshot
		fields = '__all__'

	def __init__(self, *args, **kwargs):
		super().__init__(*args, **kwargs)
		self._initial_imported_image_urls = _normalize_admin_string_list(self.instance.imported_image_urls if self.instance.pk else [])
		self._initial_suppressed_imported_image_urls = _normalize_admin_string_list(self.instance.suppressed_imported_image_urls if self.instance.pk else [])
		current_public_payload = get_source_place_payload(self.instance.listing_slug) if self.instance.pk and self.instance.listing_slug else None
		deal_override_seed = self.instance.deal_overrides if self.instance.pk and self.instance.deal_overrides else _deal_override_seed_from_public_payload(current_public_payload)
		operating_hour_seed = self.instance.operating_hour_overrides if self.instance.pk and self.instance.operating_hour_overrides else _operating_hour_override_seed_from_public_payload(current_public_payload)
		deal_seed_source = 'saved-override' if self.instance.pk and self.instance.deal_overrides else ('current-public' if deal_override_seed else 'empty')
		hour_seed_source = 'saved-override' if self.instance.pk and self.instance.operating_hour_overrides else ('current-public' if operating_hour_seed else 'empty')
		self.fields['instagram_url'].help_text = 'Optional Instagram profile URL or handle.'
		self.fields['facebook_url'].help_text = 'Optional Facebook profile URL or page handle.'
		self.fields['tiktok_url'].help_text = 'Optional TikTok profile URL or handle.'
		self.fields['youtube_url'].help_text = 'Optional YouTube profile URL or handle.'
		self.fields['imported_image_urls'].help_text = 'One imported image URL per line. Removing a pulled image here suppresses that URL from future pulls until you add it back.'
		self.fields['deal_overrides'].help_text = 'Optional deal overrides for this unclaimed business. Paste valid JSON, or plain text blocks with title on the first line, optional price on the second line, and optional description after that.'
		self.fields['deal_overrides'].help_text = 'Add multiple deals by separating them with a blank line. Supported plain-text lines: Title, Type, Price, Description, Terms, and Happy hour: Monday 3:00 PM - 6:00 PM.'
		self.fields['operating_hour_overrides'].help_text = 'Optional operating-hour overrides. Paste valid JSON, or one line per day like Monday: 11:00 AM - 9:00 PM or Monday: Open 24 hours.'
		self.fields['external_id'].help_text = 'Staff/superusers: when Source name starts with admin, save will normalize this to an admin-prefixed external ID (for example admin-camarillo-premium-outlets).'
		self.fields['imported_image_urls'].widget.attrs.update({
			'class': 'vLargeTextField structured-admin-source-field',
			'data-image-gallery-editor': 'imported-images',
		})
		self.fields['deal_overrides'].widget.attrs.update({
			'class': 'vLargeTextField structured-admin-source-field',
			'data-structured-editor': 'deals',
			'data-initial-json': json.dumps(deal_override_seed),
			'data-initial-source': deal_seed_source,
		})
		self.fields['operating_hour_overrides'].widget.attrs.update({
			'class': 'vLargeTextField structured-admin-source-field',
			'data-structured-editor': 'hours',
			'data-initial-json': json.dumps(operating_hour_seed),
			'data-initial-source': hour_seed_source,
		})
		if not self.is_bound:
			social_profiles = self.instance.social_profiles or {}
			imported_image_initial = '\n'.join(_normalize_admin_string_list(self.instance.imported_image_urls if self.instance.pk else []))
			deal_override_initial = _deal_override_text_for_admin(self.instance.deal_overrides if self.instance.pk else None)
			operating_hour_initial = _operating_hour_override_text_for_admin(self.instance.operating_hour_overrides if self.instance.pk else None)
			for platform in ('instagram', 'facebook', 'tiktok', 'youtube'):
				field_name = f'{platform}_url'
				profile = social_profiles.get(platform) or {}
				initial_value = str(profile.get('url') or '').strip()
				self.fields[field_name].initial = initial_value
				self.initial[field_name] = initial_value
			self.fields['imported_image_urls'].initial = imported_image_initial
			self.initial['imported_image_urls'] = imported_image_initial
			self.fields['deal_overrides'].initial = deal_override_initial
			self.fields['operating_hour_overrides'].initial = operating_hour_initial
			self.initial['deal_overrides'] = deal_override_initial
			self.initial['operating_hour_overrides'] = operating_hour_initial

	def clean(self):
		cleaned_data = super().clean()
		raw_deal_overrides = cleaned_data.get('deal_overrides')
		deal_overrides_touched = bool(cleaned_data.get('deal_overrides_touched'))
		raw_operating_hour_overrides = cleaned_data.get('operating_hour_overrides')
		operating_hour_overrides_touched = bool(cleaned_data.get('operating_hour_overrides_touched'))
		website_url_suppressed = bool(cleaned_data.get('website_url_suppressed'))

		normalized_social_profiles = {}
		for platform in ('instagram', 'facebook', 'tiktok', 'youtube'):
			raw_value = str(cleaned_data.get(f'{platform}_url') or '').strip()
			if not raw_value:
				continue
			try:
				profile = normalize_social_profile(platform, raw_value)
			except ValueError as error:
				self.add_error(f'{platform}_url', str(error))
				continue
			if profile:
				normalized_social_profiles[platform] = profile

		normalized_contact_channels = normalize_business_contact_channels(
			website_url=cleaned_data.get('website_url', ''),
			source_url=cleaned_data.get('source_url', ''),
			social_profiles=normalized_social_profiles,
			social_media_links=build_social_media_links(normalized_social_profiles),
		)
		if website_url_suppressed:
			normalized_contact_channels['website_url'] = ''
		cleaned_data['website_url'] = normalized_contact_channels['website_url']
		cleaned_data['source_url'] = normalized_contact_channels['source_url']
		cleaned_data['social_profiles'] = normalized_contact_channels['social_profiles']
		cleaned_data['social_media_links'] = normalized_contact_channels['social_media_links']

		try:
			cleaned_data['imported_image_urls'] = _coerce_imported_image_url_input(cleaned_data.get('imported_image_urls'))
		except ValueError as error:
			self.add_error('imported_image_urls', str(error))

		if raw_deal_overrides is not None:
			try:
				parsed_deal_overrides = _coerce_deal_override_input(raw_deal_overrides)
				if deal_overrides_touched and parsed_deal_overrides in (None, []):
					cleaned_data['deal_overrides'] = []
					cleaned_data['deal_overrides_cleared'] = True
				else:
					cleaned_data['deal_overrides'] = parsed_deal_overrides
					cleaned_data['deal_overrides_cleared'] = False
			except ValueError as error:
				self.add_error('deal_overrides', str(error))

		if raw_operating_hour_overrides is not None:
			try:
				parsed_operating_hour_overrides = _coerce_operating_hour_override_input(raw_operating_hour_overrides)
				if operating_hour_overrides_touched and parsed_operating_hour_overrides in (None, []):
					cleaned_data['operating_hour_overrides'] = []
					cleaned_data['operating_hour_overrides_cleared'] = True
				else:
					cleaned_data['operating_hour_overrides'] = parsed_operating_hour_overrides
					cleaned_data['operating_hour_overrides_cleared'] = False
			except ValueError as error:
				self.add_error('operating_hour_overrides', str(error))

		return cleaned_data

	def save(self, commit=True):
		self.instance.social_profiles = self.cleaned_data.get('social_profiles', {})
		self.instance.social_media_links = self.cleaned_data.get('social_media_links', [])
		self.instance.website_url = self.cleaned_data.get('website_url', '')
		self.instance.website_url_suppressed = bool(self.cleaned_data.get('website_url_suppressed'))
		self.instance.source_url = self.cleaned_data.get('source_url', '')
		existing_imported_image_urls = list(self._initial_imported_image_urls)
		current_imported_image_urls = _normalize_admin_string_list(self.cleaned_data.get('imported_image_urls', []))
		suppressed_imported_image_urls = list(self._initial_suppressed_imported_image_urls)
		removed_imported_image_urls = [
			image_url
			for image_url in existing_imported_image_urls
			if image_url not in current_imported_image_urls
		]
		self.instance.imported_image_urls = current_imported_image_urls
		self.instance.suppressed_imported_image_urls = [
			image_url
			for image_url in _normalize_admin_string_list([*suppressed_imported_image_urls, *removed_imported_image_urls])
			if image_url not in current_imported_image_urls
		]
		self.instance.deal_overrides_cleared = bool(self.cleaned_data.get('deal_overrides_cleared', False))
		self.instance.operating_hour_overrides_cleared = bool(self.cleaned_data.get('operating_hour_overrides_cleared', False))
		return super().save(commit=commit)


def _normalize_lookup_text(value):
	return ''.join(character.lower() for character in str(value or '') if character.isalnum())


def _normalized_domain(value):
	parsed = urlparse(str(value or '').strip())
	return str(parsed.netloc or '').strip().lower().removeprefix('www.')


def _build_listing_slug(place_record):
	return str(place_record.profile_slug or '').strip() or slugify(place_record.profile_name or place_record.name)


def _address_has_street_number(value):
	return any(character.isdigit() for character in str(value or ''))


def _normalize_address_text(value):
	return ''.join(character.lower() for character in str(value or '') if character.isalnum())


def _should_upgrade_address_line_1(existing_value, imported_value):
	existing_text = str(existing_value or '').strip()
	imported_text = str(imported_value or '').strip()
	if not existing_text or not imported_text:
		return False
	if _address_has_street_number(existing_text):
		return False
	if not _address_has_street_number(imported_text):
		return False
	existing_normalized = _normalize_address_text(existing_text)
	imported_normalized = _normalize_address_text(imported_text)
	if not existing_normalized or not imported_normalized:
		return False
	return existing_normalized in imported_normalized


def _sync_listing_snapshot_from_imported_place(place_record, snapshot=None, allow_address_mismatch_identity_reuse=True):
	existing_snapshot = snapshot

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
		'imported_image_urls': list(getattr(place_record, 'image_urls', []) or []),
		'source_name': place_record.source_name,
		'source_url': place_record.source_url,
		'external_id': place_record.external_id,
		'listing_slug': _build_listing_slug(place_record),
	}
	if existing_snapshot is not None and not str(defaults['website_url'] or '').strip():
		defaults['website_url'] = existing_snapshot.website_url
	if existing_snapshot is not None and not str(defaults['source_url'] or '').strip():
		defaults['source_url'] = existing_snapshot.source_url
	if existing_snapshot is not None and existing_snapshot.website_url_suppressed:
		defaults['website_url'] = ''
	normalized_contact_channels = normalize_business_contact_channels(
		website_url=defaults['website_url'],
		source_url=defaults['source_url'],
		social_profiles=getattr(existing_snapshot, 'social_profiles', {}),
		social_media_links=getattr(existing_snapshot, 'social_media_links', []),
	)
	defaults['website_url'] = normalized_contact_channels['website_url']
	defaults['source_url'] = normalized_contact_channels['source_url']
	defaults['social_profiles'] = normalized_contact_channels['social_profiles']
	defaults['social_media_links'] = normalized_contact_channels['social_media_links']
	defaults['website_url_suppressed'] = bool(getattr(existing_snapshot, 'website_url_suppressed', False))

	if snapshot is not None:
		_apply_non_destructive_snapshot_defaults(snapshot, defaults)
		snapshot.save()
		return snapshot

	lookup = {}
	if defaults['source_name'] and defaults['external_id']:
		lookup = {
			'source_name': defaults['source_name'],
			'external_id': defaults['external_id'],
		}
	elif defaults['listing_slug']:
		lookup = {'listing_slug': defaults['listing_slug']}
	else:
		lookup = {
			'name': defaults['name'],
			'city': defaults['city'],
			'address_line_1': defaults['address_line_1'],
		}

	existing_snapshot_queryset = ListingSnapshot.objects.filter(**lookup).order_by('-updated_at', '-captured_at', '-pk')
	if defaults['source_name'] and defaults['external_id'] and defaults['address_line_1']:
		address_matched_snapshot = existing_snapshot_queryset.filter(address_line_1=defaults['address_line_1']).first()
		if address_matched_snapshot is not None:
			existing_snapshot = address_matched_snapshot
		elif allow_address_mismatch_identity_reuse and existing_snapshot_queryset.count() == 1:
			existing_snapshot = existing_snapshot_queryset.first()
		else:
			existing_snapshot = None
	else:
		existing_snapshot = existing_snapshot_queryset.first()
	if existing_snapshot is not None:
		if not str(defaults['website_url'] or '').strip():
			defaults['website_url'] = existing_snapshot.website_url
		if not str(defaults['source_url'] or '').strip():
			defaults['source_url'] = existing_snapshot.source_url
		if existing_snapshot.website_url_suppressed:
			defaults['website_url'] = ''
		_apply_non_destructive_snapshot_defaults(existing_snapshot, defaults)
		existing_snapshot.save()
		return existing_snapshot

	snapshot = ListingSnapshot.objects.create(**defaults)
	return snapshot


def _apply_non_destructive_snapshot_defaults(snapshot, defaults):
	# Imported pulls should fill missing snapshot data without replacing admin-entered values.
	for field_name, value in defaults.items():
		existing_value = getattr(snapshot, field_name)
		if field_name == 'address_line_1':
			if not str(existing_value or '').strip() and str(value or '').strip():
				setattr(snapshot, field_name, value)
				continue
			if not str(snapshot.address_line_2 or '').strip() and not str(snapshot.neighborhood or '').strip() and _should_upgrade_address_line_1(existing_value, value):
				setattr(snapshot, field_name, value)
			continue
		if field_name == 'website_url':
			if getattr(snapshot, 'website_url_suppressed', False):
				setattr(snapshot, field_name, '')
				continue
		if field_name == 'website_url_suppressed':
			setattr(snapshot, field_name, bool(existing_value))
			continue
		if field_name in {'social_profiles', 'social_media_links'}:
			if not existing_value and value:
				setattr(snapshot, field_name, value)
			continue
		if field_name == 'imported_image_urls':
			setattr(snapshot, field_name, _filter_suppressed_imported_image_urls(snapshot, value))
			continue
		if not str(existing_value or '').strip() and str(value or '').strip():
			setattr(snapshot, field_name, value)


def _snapshot_has_admin_managed_data(snapshot):
	if snapshot.deal_overrides not in (None, [], {}):
		return True
	if bool(getattr(snapshot, 'deal_overrides_cleared', False)):
		return True
	if snapshot.operating_hour_overrides not in (None, [], {}):
		return True
	if bool(getattr(snapshot, 'operating_hour_overrides_cleared', False)):
		return True
	if bool(getattr(snapshot, 'website_url_suppressed', False)):
		return True
	if getattr(snapshot, 'suppressed_imported_image_urls', None) not in (None, [], {}):
		return True
	if str(snapshot.address_line_2 or '').strip() or str(snapshot.neighborhood or '').strip():
		return True
	for platform, profile in (snapshot.social_profiles or {}).items():
		if platform == 'website' or not isinstance(profile, dict):
			continue
		if str(profile.get('url') or '').strip():
			return True
	return False


def _sync_listing_snapshots_from_imported_places(place_records):
	touched_snapshot_ids = set()
	touched_source_names = set()
	identity_counts = {}
	for place_record in place_records:
		identity = (str(place_record.source_name or '').strip().lower(), str(place_record.external_id or '').strip().lower())
		if identity[0] and identity[1]:
			identity_counts[identity] = identity_counts.get(identity, 0) + 1
	for place_record in place_records:
		identity = (str(place_record.source_name or '').strip().lower(), str(place_record.external_id or '').strip().lower())
		allow_address_mismatch_identity_reuse = identity_counts.get(identity, 0) <= 1
		snapshot = _sync_listing_snapshot_from_imported_place(
			place_record,
			allow_address_mismatch_identity_reuse=allow_address_mismatch_identity_reuse,
		)
		touched_snapshot_ids.add(snapshot.pk)
		if str(place_record.source_name or '').strip():
			touched_source_names.add(str(place_record.source_name).strip())

	for source_name in touched_source_names:
		stale_snapshots = ListingSnapshot.objects.filter(source_name=source_name, business_claims__isnull=True).exclude(pk__in=touched_snapshot_ids)
		for snapshot in stale_snapshots:
			if _snapshot_has_admin_managed_data(snapshot):
				continue
			snapshot.delete()
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


def _preferred_snapshot_enrichment_source_url(snapshot):
	return str(snapshot.source_url or '').strip()


def _apply_snapshot_enrichment_url_override(snapshot, place_record):
	overrides = {}
	preferred_website_url = '' if bool(getattr(snapshot, 'website_url_suppressed', False)) else str(snapshot.website_url or '').strip()
	preferred_source_url = _preferred_snapshot_enrichment_source_url(snapshot)
	if bool(getattr(snapshot, 'website_url_suppressed', False)):
		overrides['website_url'] = ''
	elif preferred_website_url:
		overrides['website_url'] = preferred_website_url
	if preferred_source_url:
		overrides['source_url'] = preferred_source_url
	if not overrides:
		return place_record
	return replace(place_record, **overrides)


def _find_best_matching_snapshot(place_record, snapshots):
	best_snapshot = None
	best_score = 0
	for snapshot in snapshots:
		score = _snapshot_match_score(snapshot, place_record)
		if score > best_score:
			best_snapshot = snapshot
			best_score = score
	return best_snapshot if best_score >= 70 else None


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
	delete_confirmation_template = 'admin/places/customeraccount/delete_confirmation.html'
	delete_selected_confirmation_template = 'admin/places/customeraccount/delete_selected_confirmation.html'
	list_display = (
		'username',
		'email',
		'first_name',
		'last_name',
		'email_verification_status',
		'is_active',
		'date_joined',
	)
	list_filter = ('is_active', 'date_joined')
	search_fields = ('username', 'first_name', 'last_name', 'email')
	ordering = ('-date_joined',)
	readonly_fields = ('date_joined', 'last_login')
	fieldsets = (
		('Customer account', {
			'fields': ('username', 'password'),
		}),
		('Profile', {
			'fields': ('first_name', 'last_name', 'email'),
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

@admin.register(BusinessAccount, site=happyhour_admin_site)
class BusinessAccountAdmin(UserAdmin):
	delete_confirmation_template = 'admin/places/businessaccount/delete_confirmation.html'
	delete_selected_confirmation_template = 'admin/places/businessaccount/delete_selected_confirmation.html'
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
	readonly_fields = (
		'date_joined',
		'last_login',
		'business_status',
		'membership_status',
		'claim_count',
		'membership_count',
		'managed_businesses',
		'managed_business_public_address',
		'managed_business_public_phone',
		'managed_business_public_website',
		'managed_business_public_deals_preview',
		'managed_business_public_hours_preview',
		'managed_business_supporting_details',
	)
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
		('Managed business profile', {
			'fields': (
				'managed_businesses',
				'managed_business_public_address',
				'managed_business_public_phone',
				'managed_business_public_website',
				'managed_business_public_deals_preview',
				'managed_business_public_hours_preview',
				'managed_business_supporting_details',
			),
			'description': 'These values reflect the current public business profile the app is showing for the active managed business, including approved business-user overrides.',
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

	def _get_active_membership(self, obj):
		memberships = [membership for membership in obj.business_memberships.all() if membership.is_active]
		if not memberships:
			return None
		memberships.sort(key=lambda membership: (membership.approved_at or membership.created_at, membership.pk), reverse=True)
		return memberships[0]

	def _get_active_managed_business_payload(self, obj):
		membership = self._get_active_membership(obj)
		if membership is None:
			return None
		snapshot = membership.claim.listing_snapshot
		if snapshot.listing_slug:
			payload = get_source_place_payload(snapshot.listing_slug)
			if payload is not None:
				return payload
		return {
			'name': snapshot.name,
			'address_line_1': membership.claim.employer_address or snapshot.address_line_1,
			'address_line_2': snapshot.address_line_2,
			'city_label': snapshot.get_city_display() or snapshot.city,
			'state': snapshot.state,
			'postal_code': snapshot.postal_code,
			'phone_number': membership.claim.work_phone or snapshot.phone_number,
			'website_url': membership.claim.business_website_url or snapshot.website_url,
			'deals': [],
			'operating_hours': [],
			'supporting_details': membership.claim.supporting_details,
		}

	def _get_active_managed_claim(self, obj):
		membership = self._get_active_membership(obj)
		return membership.claim if membership is not None else None

	@admin.display(description='Public address')
	def managed_business_public_address(self, obj):
		payload = self._get_active_managed_business_payload(obj)
		if payload is None:
			return 'No active business'
		line_parts = [payload.get('address_line_1', ''), payload.get('address_line_2', '')]
		city_line = ', '.join(part for part in [payload.get('city_label', ''), payload.get('state', '')] if part)
		postal_code = payload.get('postal_code', '')
		if city_line and postal_code:
			city_line = f'{city_line} {postal_code}'
		if city_line:
			line_parts.append(city_line)
		return ', '.join(part for part in line_parts if part) or 'No public address'

	@admin.display(description='Public phone')
	def managed_business_public_phone(self, obj):
		payload = self._get_active_managed_business_payload(obj)
		if payload is None:
			return 'No active business'
		return payload.get('phone_number') or 'No public phone'

	@admin.display(description='Public website')
	def managed_business_public_website(self, obj):
		payload = self._get_active_managed_business_payload(obj)
		if payload is None:
			return 'No active business'
		website_url = payload.get('website_url') or ''
		if not website_url:
			return 'No public website'
		return format_html('<a href="{}" target="_blank" rel="noopener">{}</a>', website_url, website_url)

	@admin.display(description='Public deals')
	def managed_business_public_deals_preview(self, obj):
		payload = self._get_active_managed_business_payload(obj)
		if payload is None:
			return 'No active business'
		preview_lines = _format_public_deals_preview_lines(list(payload.get('deals', [])))
		if not preview_lines:
			return 'No deals currently surfaced.'
		return format_html_join('', '{}<br>', ((line,) for line in preview_lines))

	@admin.display(description='Public hours')
	def managed_business_public_hours_preview(self, obj):
		payload = self._get_active_managed_business_payload(obj)
		if payload is None:
			return 'No active business'
		preview_lines = _format_public_hours_preview_lines(list(payload.get('operating_hours', [])))
		if not preview_lines:
			return 'No operating hours currently surfaced.'
		return format_html_join('', '{}<br>', ((line,) for line in preview_lines))

	@admin.display(description='Business notes')
	def managed_business_supporting_details(self, obj):
		claim = self._get_active_managed_claim(obj)
		if claim is None:
			return 'No active business'
		return claim.supporting_details or 'No supporting details provided.'

	@admin.display(description='Claims')
	def claim_count(self, obj):
		return obj.business_claims.count()

	@admin.display(description='Memberships')
	def membership_count(self, obj):
		return obj.business_memberships.count()


@admin.register(ListingSnapshot, site=happyhour_admin_site)
class ListingSnapshotAdmin(admin.ModelAdmin):
	form = ListingSnapshotAdminForm
	actions = ['pull_all_business_data']
	change_list_template = 'admin/places/listingsnapshot/change_list.html'
	list_display = ('name', 'city', 'venue_type', 'source_name', 'imported_image_count', 'current_public_deal_count', 'manual_deal_override_count', 'pull_business_data_link', 'captured_at', 'updated_at')
	list_filter = ('city', 'venue_type', 'source_name', HasImportedImagesFilter, ManagedByBusinessUserFilter)
	search_fields = ('name', 'address_line_1', 'external_id', 'website_url')
	readonly_fields = ('managed_business_account_link', 'imported_image_count', 'current_public_images_preview', 'current_public_deals_preview', 'current_public_hours_preview', 'manual_deal_override_summary', 'manual_operating_hour_override_summary', 'captured_at', 'updated_at')
	fieldsets = (
		('Snapshot identity', {
			'fields': ('name', 'listing_slug', 'source_name', 'source_url', 'external_id', 'managed_business_account_link'),
		}),
		('Business details', {
			'fields': ('city', 'venue_type', 'address_line_1', 'address_line_2', 'neighborhood', 'state', 'postal_code'),
		}),
		('Contact', {
			'fields': ('phone_number', 'website_url', 'website_url_suppressed'),
		}),
		('Social media', {
			'fields': ('instagram_url', 'facebook_url', 'tiktok_url', 'youtube_url'),
			'description': 'Store third-party profile URLs here instead of putting them in Website or Source URL.',
		}),
		('Current app data', {
			'fields': ('imported_image_count', 'imported_image_urls', 'current_public_images_preview', 'current_public_deals_preview', 'current_public_hours_preview'),
			'description': 'These previews show the imported images, deals, and hours currently available for this business after importer enrichment and any overrides. Removing imported image URLs here suppresses those pulled images from future admin pulls.',
		}),
		('Admin overrides for unclaimed businesses', {
			'fields': ('deal_overrides', 'manual_deal_override_summary', 'operating_hour_overrides', 'manual_operating_hour_override_summary'),
			'description': 'Use these structured overrides to fix or add legitimate deals and hours for existing unclaimed businesses. Once a business is claimed, the owner claim overrides take precedence.',
		}),
		('Timestamps', {
			'fields': ('captured_at', 'updated_at'),
			'classes': ('collapse',),
		}),
	)

	def get_queryset(self, request):
		queryset = super().get_queryset(request)
		return queryset.filter(
			(
				~Q(source_name__in=(BusinessClaim.ADMIN_SOURCE_NAME, *BusinessClaim.USER_SOURCE_NAMES))
				| Q(source_name=BusinessClaim.ADMIN_SOURCE_NAME, business_claims__isnull=True)
			)
			| Q(business_claims__membership__is_active=True)
		).distinct()

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
		self._changelist_public_deal_counts = {
			payload.get('slug'): len(list(payload.get('deals', [])))
			for payload in get_source_place_payloads(resolve_missing_coordinates=False)
			if payload.get('slug')
		}
		response = super().changelist_view(request, extra_context=extra_context)
		if hasattr(response, 'add_post_render_callback'):
			response.add_post_render_callback(lambda rendered_response: self._clear_changelist_public_deal_counts())
		else:
			self._clear_changelist_public_deal_counts()
		return response

	def _clear_changelist_public_deal_counts(self):
		self._changelist_public_deal_counts = None

	@admin.display(description='Pull business data')
	def pull_business_data_link(self, obj):
		url = reverse('happyhour_admin:places_listingsnapshot_pull_one', args=[obj.pk])
		return format_html('<a class="button" href="{}">Pull business data</a>', url)

	@admin.display(description='Images')
	def imported_image_count(self, obj):
		return len(list(getattr(obj, 'imported_image_urls', []) or []))

	@admin.display(description='Current app images')
	def current_public_images_preview(self, obj):
		image_urls = list(getattr(obj, 'imported_image_urls', []) or [])[:3]
		if not image_urls:
			return 'No imported images'
		return format_html(
			'{}',
			format_html_join(
				'',
				'<img src="{}" alt="Imported image" style="width:72px;height:72px;object-fit:cover;border-radius:10px;border:1px solid #d9c7b2;margin-right:8px;" />',
				((image_url,) for image_url in image_urls),
			),
		)

	@admin.action(description='Pull all business data')
	def pull_all_business_data(self, request, queryset):
		return self._run_pull_all_business_data(request)

	def pull_all_business_data_view(self, request):
		if not self.has_change_permission(request):
			return HttpResponseRedirect(reverse('happyhour_admin:index'))
		return self._run_pull_all_business_data(request)

	def _run_pull_all_business_data(self, request):
		discovery_records = filter_deleted_business_records(list(HerePlacesImporter().load_records()))
		existing_snapshots = list(
			ListingSnapshot.objects
			.exclude(source_name__in=(BusinessClaim.ADMIN_SOURCE_NAME, *BusinessClaim.USER_SOURCE_NAMES))
			.order_by('-updated_at', '-pk')
		)
		discovery_records = [
			_apply_snapshot_enrichment_url_override(snapshot, place_record)
			if snapshot is not None else place_record
			for place_record in discovery_records
			for snapshot in [_find_best_matching_snapshot(place_record, existing_snapshots)]
		]
		discovery_records = list(BusinessWebsiteImporter().enrich_place_records(discovery_records))
		write_discovery_json_records(discovery_records)
		snapshot_records = list(load_canonical_source_records(source_name=get_listing_source_name()))
		touched_snapshot_ids = _sync_listing_snapshots_from_imported_places(snapshot_records)
		self.message_user(
			request,
			f'Pulled all business data. Stored {len(discovery_records)} live businesses with website enrichment and synced {len(touched_snapshot_ids)} admin rows.',
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

		best_record = _apply_snapshot_enrichment_url_override(snapshot, best_record)
		best_record = BusinessWebsiteImporter().enrich_place_record(best_record)
		merge_discovery_json_records([best_record])
		_sync_listing_snapshot_from_imported_place(best_record, snapshot=snapshot)
		self.message_user(request, f'Pulled business data for {snapshot.name}.', level=messages.SUCCESS)
		return HttpResponseRedirect(reverse('happyhour_admin:places_listingsnapshot_changelist'))

	def _get_active_business_membership(self, obj):
		return (
			BusinessMembership.objects
			.select_related('user', 'claim__listing_snapshot')
			.filter(claim__listing_snapshot=obj, is_active=True)
			.order_by('-approved_at', '-created_at', '-pk')
			.first()
		)

	@admin.display(description='Managed business account')
	def managed_business_account_link(self, obj):
		membership = self._get_active_business_membership(obj)
		if membership is None or membership.user_id is None:
			return 'No active business account manages this business.'
		change_url = reverse('happyhour_admin:places_businessaccount_change', args=[membership.user_id])
		return format_html('<a class="button" href="{}">Open {}</a>', change_url, membership.user.username)

	@admin.display(description='Public deals')
	def current_public_deal_count(self, obj):
		deal_counts = getattr(self, '_changelist_public_deal_counts', None)
		if deal_counts is not None:
			return int(deal_counts.get(obj.listing_slug, 0))
		payload = get_source_place_payload(obj.listing_slug) if obj.listing_slug else None
		return len(list((payload or {}).get('deals', [])))

	@admin.display(description='Manual deal overrides')
	def manual_deal_override_count(self, obj):
		return len(obj.deal_overrides or [])

	@admin.display(description='Current public deals')
	def current_public_deals_preview(self, obj):
		payload = get_source_place_payload(obj.listing_slug) if obj.listing_slug else None
		deals = list((payload or {}).get('deals', []))
		if not deals:
			return 'No deals currently surfaced.'
		preview_lines = _format_public_deals_preview_lines(deals)
		return format_html_join('', '{}<br>', ((line,) for line in preview_lines))

	@admin.display(description='Current public hours')
	def current_public_hours_preview(self, obj):
		payload = get_source_place_payload(obj.listing_slug) if obj.listing_slug else None
		operating_hours = list((payload or {}).get('operating_hours', []))
		if not operating_hours:
			return 'No operating hours currently surfaced.'
		preview_lines = _format_public_hours_preview_lines(operating_hours)
		return format_html_join('', '{}<br>', ((line,) for line in preview_lines))

	@admin.display(description='Saved deal override summary')
	def manual_deal_override_summary(self, obj):
		summaries = summarize_deal_overrides(obj.deal_overrides or [])
		if not summaries:
			return 'No manual deal overrides saved.'
		return format_html_join('', '{}<br>', ((line,) for line in summaries))

	@admin.display(description='Saved hour override summary')
	def manual_operating_hour_override_summary(self, obj):
		summaries = summarize_operating_hour_overrides(obj.operating_hour_overrides or [])
		if not summaries:
			return 'No manual operating hour overrides saved.'
		return format_html_join('', '{}<br>', ((line,) for line in summaries))

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
			'fields': ('phone_number', 'website_url', 'website_url_suppressed'),
		}),
		('Social media', {
			'fields': ('social_profiles', 'social_media_links'),
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
		snapshot = _sync_listing_snapshot_from_imported_place(place_record)
		if snapshot is not None and deleted_business.website_url_suppressed:
			snapshot.website_url_suppressed = True
			snapshot.website_url = ''
			snapshot.save(update_fields=['website_url_suppressed', 'website_url', 'updated_at'])
		deleted_business.delete()


class BusinessClaimProfileEntryInline(admin.TabularInline):
	model = BusinessClaimProfileEntry
	extra = 0
	can_delete = False
	fields = ('entry_kind', 'value', 'sort_order', 'metadata', 'created_at', 'updated_at')
	readonly_fields = ('entry_kind', 'value', 'sort_order', 'metadata', 'created_at', 'updated_at')
	ordering = ('entry_kind', 'sort_order', 'id')
	verbose_name = 'Submitted profile entry'
	verbose_name_plural = 'Submitted profile entries'


class BusinessClaimAttachmentInline(admin.TabularInline):
	model = BusinessClaimAttachment
	extra = 0
	can_delete = False
	fields = ('attachment_kind', 'original_filename', 'file_link', 'content_type', 'file_size_display', 'created_at')
	readonly_fields = ('attachment_kind', 'original_filename', 'file_link', 'content_type', 'file_size_display', 'created_at')
	ordering = ('attachment_kind', 'created_at')
	verbose_name = 'Submitted attachment'
	verbose_name_plural = 'Submitted attachments'

	@admin.display(description='Stored file')
	def file_link(self, obj):
		if not obj.file:
			return 'No file'
		return format_html('<a href="{}" target="_blank" rel="noopener">{}</a>', obj.file.url, obj.original_filename or 'Open file')

	@admin.display(description='File size')
	def file_size_display(self, obj):
		return f'{(obj.file_size or 0) / (1024 ** 3):.4f} GB'


@admin.register(BusinessClaim, site=happyhour_admin_site)
class BusinessClaimAdmin(admin.ModelAdmin):
	approve_override_confirmation_template = 'admin/places/businessclaim/approve_override_confirmation.html'
	delete_confirmation_template = 'admin/places/businessclaim/delete_confirmation.html'
	delete_selected_confirmation_template = 'admin/places/businessclaim/delete_selected_confirmation.html'
	class PriorRejectionFilter(admin.SimpleListFilter):
		title = 'Prior rejections'
		parameter_name = 'has_prior_rejections'

		def lookups(self, request, model_admin):
			return (
				('yes', 'Has prior rejections'),
				('no', 'No prior rejections'),
			)

		def queryset(self, request, queryset):
			value = self.value()
			if value not in {'yes', 'no'}:
				return queryset

			prior_rejections = BusinessClaim.objects.filter(
				claimant__email=OuterRef('claimant__email'),
				status=BusinessClaim.Status.REJECTED,
			).exclude(pk=OuterRef('pk'))
			queryset = queryset.annotate(has_prior_rejections=Exists(prior_rejections))
			if value == 'yes':
				return queryset.filter(has_prior_rejections=True)
			return queryset.filter(has_prior_rejections=False)

	change_list_template = 'admin/places/businessclaim/change_list.html'
	form = BusinessClaimAdminForm
	actions = ['mark_under_review', 'approve_selected_claims', 'reject_selected_claims']
	inlines = (BusinessClaimProfileEntryInline, BusinessClaimAttachmentInline)
	list_display = ('listing_snapshot', 'contact_name', 'claimant_email_display', 'claimant', 'status', 'attempt_number_display', 'current_attempt_display', 'prior_rejection_count_display', 'verification_score_display', 'verification_flags_display', 'work_email', 'submitted_at', 'reviewed_at')
	list_filter = ('status', 'listing_snapshot__city', PriorRejectionFilter)
	search_fields = ('listing_snapshot__name', 'contact_name', 'claimant__username', 'work_email')
	readonly_fields = ('verification_score', 'verification_flags_display', 'attempt_number_display', 'current_attempt_display', 'prior_rejection_count_display', 'attempt_history_display', 'submitted_at', 'reviewed_at', 'reviewed_by', 'created_at', 'updated_at')
	autocomplete_fields = ('claimant', 'listing_snapshot', 'reviewed_by')
	list_select_related = ('listing_snapshot', 'claimant', 'reviewed_by')
	list_per_page = 25
	fieldsets = (
		('Claim status', {
			'fields': ('status', 'pathway', 'listing_snapshot', 'claimant'),
		}),
		('Business contact', {
			'fields': ('contact_name', 'job_title', 'work_email', 'work_phone', 'employer_address', 'address_not_applicable', 'serves_multiple_areas', 'business_website_url'),
		}),
		('Verification details', {
			'fields': ('verification_summary', 'supporting_details', 'verification_score', 'verification_flags_display'),
			'description': 'These are the claim-level materials submitted by the business claimant for review. Uploaded files and structured profile details appear in the inline sections below.',
		}),
		('Admin review', {
			'fields': ('rejection_reason_codes', 'reviewer_notes', 'reviewed_by', 'reviewed_at'),
			'description': 'Select structured rejection reasons before rejecting a claim. Reviewer notes remain available for additional claim-specific detail.',
		}),
		('Attempt history', {
			'fields': ('attempt_number_display', 'current_attempt_display', 'prior_rejection_count_display', 'attempt_history_display'),
			'description': 'Older attempts for the same claimant account email stay in the database for audit history. Approval should be treated as the current winning outcome, while prior attempts remain visible here.',
		}),
		('Timestamps', {
			'fields': ('submitted_at', 'created_at', 'updated_at'),
			'classes': ('collapse',),
		}),
	)

	def get_queryset(self, request):
		queryset = self.model._default_manager.get_queryset()
		same_email_attempts = BusinessClaim.objects.filter(
			claimant__email=OuterRef('claimant__email'),
		).order_by('-created_at', '-pk')
		queryset = queryset.annotate(
			attempt_group_latest_created_at=Subquery(same_email_attempts.values('created_at')[:1]),
			attempt_group_latest_pk=Subquery(same_email_attempts.values('pk')[:1]),
		)
		ordering = self.get_ordering(request)
		if ordering:
			queryset = queryset.order_by(*ordering)
		return queryset

	def get_ordering(self, request):
		return ('-attempt_group_latest_created_at', '-attempt_group_latest_pk', '-created_at', '-pk')

	def _get_attempt_history_queryset(self, obj):
		if not obj or not obj.pk:
			return BusinessClaim.objects.none()

		return BusinessClaim.objects.select_related('claimant', 'listing_snapshot', 'reviewed_by').filter(
			claimant__email=getattr(obj.claimant, 'email', ''),
		).exclude(pk=obj.pk).order_by('-created_at', '-pk')

	def _get_attempt_history_claims(self, obj):
		return list(self._get_attempt_history_queryset(obj))

	def _get_attempt_group_claims(self, obj):
		if not obj or not obj.pk:
			return []
		attempts = [obj, *self._get_attempt_history_claims(obj)]
		return sorted(attempts, key=lambda claim: (claim.created_at, claim.pk))

	@admin.action(description='Mark selected claims under review')
	def mark_under_review(self, request, queryset):
		updated = queryset.exclude(status=BusinessClaim.Status.APPROVED).update(status=BusinessClaim.Status.UNDER_REVIEW)
		self.message_user(request, f'{updated} claim(s) marked under review.')

	@admin.action(description='Approve selected claims and create memberships')
	def approve_selected_claims(self, request, queryset):
		if 'force_approve' in request.POST:
			approved = 0
			for claim in queryset:
				try:
					claim.approve(reviewed_by=request.user, force=True)
					approved += 1
				except ValidationError as error:
					self.message_user(request, f'Could not approve {claim}: {error}', level='ERROR')
			self.message_user(request, f'{approved} claim(s) approved.')
			return None

		blocked_claims = []
		for claim in queryset:
			verdict = claim.refresh_verification_state(save=False)
			if verdict['blockers']:
				blocked_claims.append(
					{
						'claim': claim,
						'blockers': [_format_verification_blocker(blocker) for blocker in verdict['blockers']],
					}
				)

		if blocked_claims:
			context = {
				**self.admin_site.each_context(request),
				'title': 'Confirm force approval',
				'opts': self.model._meta,
				'queryset': queryset,
				'blocked_claims': blocked_claims,
				'action_checkbox_name': admin.helpers.ACTION_CHECKBOX_NAME,
				'action_name': 'approve_selected_claims',
				'changelist_url': reverse('happyhour_admin:places_businessclaim_changelist'),
			}
			return TemplateResponse(request, self.approve_override_confirmation_template, context)

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
		rejected = 0
		for claim in queryset:
			try:
				claim.reject(reviewed_by=request.user, reviewer_notes=claim.reviewer_notes)
				rejected += 1
			except ValidationError as error:
				self.message_user(request, f'Could not reject {claim}: {error}', level='ERROR')
		self.message_user(request, f'{rejected} claim(s) rejected.')

	def save_model(self, request, obj, form, change):
		obj.refresh_verification_state(save=False)
		previous_status = None
		if change:
			previous_status = BusinessClaim.objects.only('status').get(pk=obj.pk).status

		if change and obj.status == BusinessClaim.Status.APPROVED and previous_status != BusinessClaim.Status.APPROVED:
			obj.approve(reviewed_by=request.user, reviewer_notes=obj.reviewer_notes)
			return

		if change and obj.status == BusinessClaim.Status.REJECTED and previous_status != BusinessClaim.Status.REJECTED:
			obj.reject(reviewed_by=request.user, reviewer_notes=obj.reviewer_notes)
			return

		if obj.status == BusinessClaim.Status.UNDER_REVIEW and not obj.reviewed_by:
			obj.reviewed_by = request.user
		super().save_model(request, obj, form, change)

	@admin.display(description='Trust score')
	def verification_score_display(self, obj):
		return obj.verification_score

	@admin.display(description='Account email', ordering='claimant__email')
	def claimant_email_display(self, obj):
		return getattr(obj.claimant, 'email', '')

	@admin.display(description='Attempt #')
	def attempt_number_display(self, obj):
		for index, claim in enumerate(self._get_attempt_group_claims(obj), start=1):
			if claim.pk == obj.pk:
				return index
		return 1

	@admin.display(description='Current attempt')
	def current_attempt_display(self, obj):
		attempts = self._get_attempt_group_claims(obj)
		if not attempts:
			return 'Yes'
		latest_attempt = attempts[-1]
		if latest_attempt.pk == obj.pk:
			return 'Yes'
		return 'No'

	@admin.display(description='Prior rejections')
	def prior_rejection_count_display(self, obj):
		return sum(1 for claim in self._get_attempt_history_claims(obj) if claim.status == BusinessClaim.Status.REJECTED)

	@admin.display(description='Attempt history')
	def attempt_history_display(self, obj):
		attempts = self._get_attempt_history_claims(obj)
		if not attempts:
			return 'No earlier claim attempts found.'

		status_labels = dict(BusinessClaim.Status.choices)
		items = []
		for claim in attempts:
			change_url = reverse('happyhour_admin:places_businessclaim_change', args=[claim.pk])
			reviewed_label = timezone.localtime(claim.reviewed_at).strftime('%b. %d, %Y, %I:%M %p') if claim.reviewed_at else 'Not reviewed yet'
			claimant_label = claim.claimant.username if claim.claimant_id else claim.contact_name
			business_label = getattr(claim.listing_snapshot, 'name', '') or 'Unknown business'
			items.append(
				format_html(
					'<li><a href="{}">{}</a> for {}: {} for {} on {}</li>',
					change_url,
					claim.contact_name,
					business_label,
					status_labels.get(claim.status, claim.status),
					claimant_label,
					reviewed_label,
				)
			)
		return format_html('<ul style="margin:0; padding-left: 18px;">{}</ul>', format_html_join('', '{}', ((item,) for item in items)))

	@admin.display(description='Verification flags')
	def verification_flags_display(self, obj):
		return ', '.join(obj.verification_flags or []) or 'None'


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
