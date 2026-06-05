from django.conf import settings
from django.core.mail import send_mail
from django.utils.html import escape
from django.utils import timezone
from email.utils import formataddr, parseaddr

from places.models import AccountProfile, BusinessClaim, FavoriteBusiness, ProfileAuthToken, VenueType
from places.services.social_profiles import build_social_media_links, get_business_website_url, normalize_social_profiles


def _get_branded_from_email():
	configured_from_email = str(getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@diningdealz.local') or '').strip()
	name, address = parseaddr(configured_from_email)
	if address:
		if name:
			return configured_from_email
		return formataddr(('DiningDealz', address))
	return formataddr(('DiningDealz', 'noreply@diningdealz.local'))


def _get_support_contact_email():
	configured_support_email = str(getattr(settings, 'SUPPORT_CONTACT_EMAIL', '') or '').strip()
	_, support_address = parseaddr(configured_support_email)
	if support_address:
		return support_address

	configured_server_email = str(getattr(settings, 'SERVER_EMAIL', '') or '').strip()
	_, server_address = parseaddr(configured_server_email)
	if server_address:
		return server_address

	configured_from_email = str(getattr(settings, 'DEFAULT_FROM_EMAIL', '') or '').strip()
	_, from_address = parseaddr(configured_from_email)
	if from_address:
		return from_address

	return 'support@diningdealz.local'


def get_primary_business_claim(user, claim=None):
	if claim is not None:
		return claim
	return user.business_claims.select_related('listing_snapshot').order_by('-created_at').first()


def has_active_business_membership(user):
	return user.business_memberships.filter(is_active=True).exists()


def claim_requires_creation_review_hold(claim):
	return bool(
		claim is not None
		and claim.pathway in {BusinessClaim.Pathway.ESTABLISHED, BusinessClaim.Pathway.INFORMAL}
		and claim.status in {
			BusinessClaim.Status.DRAFT,
			BusinessClaim.Status.SUBMITTED,
			BusinessClaim.Status.UNDER_REVIEW,
			BusinessClaim.Status.NEEDS_INFO,
			BusinessClaim.Status.REJECTED,
		}
	)


def get_business_access_hold_claim(user, portal, claim=None):
	if portal != 'business':
		return None
	if has_active_business_membership(user):
		return None
	primary_claim = get_primary_business_claim(user, claim)
	if primary_claim is None:
		return None
	if primary_claim.status == BusinessClaim.Status.APPROVED:
		return None
	return primary_claim


def build_claim_review_message(claim):
	if claim is None:
		return ''
	business_name = claim.listing_snapshot.name
	if claim.status == BusinessClaim.Status.REJECTED:
		return (
			f'DiningDealz reviewed your business profile creation claim for {business_name}. '
			'We sent a rejection email with the reason and the submitted materials that need correction before approval.'
		)
	if claim.status == BusinessClaim.Status.NEEDS_INFO:
		return (
			f'DiningDealz needs more information to finish reviewing your business profile creation claim for {business_name}. '
			'Check your email for the latest review status before trying again.'
		)
	return (
		f'DiningDealz has received your business profile creation claim for {business_name}. '
		'After review is complete, we will email you an approval or rejection decision.'
	)


def get_or_create_account_profile(user):
	profile, created = AccountProfile.objects.get_or_create(
		user=user,
		defaults={
			'billing_portal_url': _default_billing_portal_url(user),
		},
	)
	if not created and not profile.billing_portal_url:
		profile.billing_portal_url = _default_billing_portal_url(user)
		profile.save(update_fields=['billing_portal_url', 'updated_at'])
	if reconcile_expired_email_change(user, profile=profile):
		profile.refresh_from_db()
	return profile


def get_or_create_profile_token(user):
	token = user.profile_auth_tokens.order_by('-last_used_at').first()
	if token is not None:
		return token
	return ProfileAuthToken.objects.create(user=user)


def infer_portal_for_user(user, requested_portal=''):
	normalized = str(requested_portal or '').strip().lower()
	if normalized in {'customer', 'business'}:
		return normalized
	if has_active_business_membership(user):
		return 'business'
	return 'customer'


def build_account_response(user, portal, claim=None, token=None):
	claims = list(user.business_claims.select_related('listing_snapshot').order_by('-created_at'))
	memberships = list(user.business_memberships.select_related('claim__listing_snapshot').all())
	active_membership = next((membership for membership in memberships if membership.is_active), None)
	primary_claim = claim or (claims[0] if claims else None)
	hold_claim = get_business_access_hold_claim(user, portal, claim=primary_claim)
	profile = get_or_create_account_profile(user)

	if active_membership:
		business_status = 'approved'
		profile_type = 'business'
	elif primary_claim:
		business_status = primary_claim.status
		profile_type = 'business' if portal == 'business' else 'customer'
	else:
		business_status = ''
		profile_type = 'customer'

	approved_businesses = [
		{
			'id': membership.claim.listing_snapshot.id,
			'slug': membership.claim.listing_snapshot.listing_slug,
			'name': membership.claim.listing_snapshot.name,
			'city': membership.claim.listing_snapshot.city,
			'city_label': membership.claim.listing_snapshot.get_city_display() if membership.claim.listing_snapshot.city else '',
			'venue_type': membership.claim.listing_snapshot.venue_type,
			'venue_type_label': membership.claim.listing_snapshot.get_venue_type_display() if membership.claim.listing_snapshot.venue_type else '',
			'address_line_1': membership.claim.listing_snapshot.address_line_1,
			'website_url': membership.claim.business_website_url or membership.claim.listing_snapshot.website_url,
		}
		for membership in memberships
		if membership.is_active
	]

	favorite_businesses = [
		{
			'slug': favorite.listing_slug,
			'name': favorite.name,
			'city': favorite.city,
			'city_label': favorite.city_label,
			'venue_type': favorite.venue_type,
			'venue_type_label': favorite.venue_type_label,
			'address_line_1': favorite.address_line_1,
			'website_url': favorite.website_url,
		}
		for favorite in FavoriteBusiness.objects.filter(user=user).order_by('name', 'city_label', '-created_at')
	]

	business_contact = {}
	if primary_claim is not None:
		editable_photo_references = _get_editable_business_photo_references(primary_claim)
		normalized_social_profiles = normalize_social_profiles(
			primary_claim.social_profiles,
			fallback_website_url=primary_claim.business_website_url,
			fallback_social_links=primary_claim.social_media_links,
		)
		business_contact = {
			'contact_name': primary_claim.contact_name,
			'job_title': primary_claim.job_title,
			'work_email': primary_claim.work_email,
			'work_phone': primary_claim.work_phone,
			'employer_address': primary_claim.employer_address,
			'business_website_url': get_business_website_url(normalized_social_profiles, fallback=primary_claim.business_website_url),
			'social_profiles': normalized_social_profiles,
			'social_media_links': build_social_media_links(normalized_social_profiles),
			'offer_entries': primary_claim.offer_entries,
			'hours_of_operation_entries': primary_claim.hours_of_operation_entries,
			'photo_references': editable_photo_references,
			'supporting_details': primary_claim.supporting_details,
			'verification_summary': primary_claim.verification_summary,
		}

	tracked_business_location = {}
	business_location_tracking_available = False
	business_location_tracking_enabled = False
	requires_business_location_tracking = False
	tracked_snapshot = active_membership.claim.listing_snapshot if active_membership else (primary_claim.listing_snapshot if primary_claim else None)
	if tracked_snapshot is not None and (tracked_snapshot.venue_type == VenueType.MOBILE or tracked_snapshot.serves_multiple_areas):
		business_location_tracking_available = True
		business_location_tracking_enabled = bool(profile.business_location_tracking_enabled)
		requires_business_location_tracking = business_location_tracking_enabled
		tracked_business_location = {
			'latitude': tracked_snapshot.tracked_location_latitude,
			'longitude': tracked_snapshot.tracked_location_longitude,
			'accuracy_meters': tracked_snapshot.tracked_location_accuracy_meters,
			'updated_at': tracked_snapshot.tracked_location_updated_at,
		}

	return {
		'id': user.id,
		'username': user.username,
		'email': user.email,
		'first_name': user.first_name,
		'last_name': user.last_name,
		'portal': portal,
		'profile_type': profile_type,
		'auth_token': token.key if token else '',
		'business_status': business_status,
		'claim_id': primary_claim.id if primary_claim else None,
		'claim_status': primary_claim.status if primary_claim else None,
		'claim_pathway': primary_claim.pathway if primary_claim else None,
		'claim_review_pending': bool(hold_claim),
		'claim_review_message': build_claim_review_message(hold_claim),
		'business_name': active_membership.claim.listing_snapshot.name if active_membership else (primary_claim.listing_snapshot.name if primary_claim else ''),
		'email_verified': profile.email_is_verified,
		'email_verification_sent_at': profile.email_verification_sent_at,
		'two_factor_enabled': profile.two_factor_enabled,
		'two_factor_pending_setup': bool(profile.two_factor_pending_secret and not profile.two_factor_enabled),
		'billing_portal_url': profile.billing_portal_url if profile_type == 'business' else '',
		'approved_businesses': approved_businesses,
		'favorite_businesses': favorite_businesses,
		'business_contact': business_contact,
		'business_location_tracking_available': business_location_tracking_available,
		'business_location_tracking_enabled': business_location_tracking_enabled,
		'requires_business_location_tracking': requires_business_location_tracking,
		'tracked_business_location': tracked_business_location,
		'can_access_places': not bool(hold_claim),
	}


def build_email_verification_challenge(user, portal, claim=None, force_resend=False):
	profile = get_or_create_account_profile(user)
	if force_resend or not profile.email_verification_code_is_active():
		send_verification_email(user, profile)

	payload = build_account_response(user, portal, claim=claim, token=None)
	payload.update({
		'auth_token': '',
		'can_access_places': False,
		'detail': 'Enter the 6-digit verification code we sent to your email to continue.',
		'email_verification_required': True,
		'verification_code_expires_at': profile.get_email_verification_code_expires_at(),
		'verification_code_ttl_seconds': profile.get_email_verification_code_ttl_seconds(),
	})
	return payload


def _get_editable_business_photo_references(claim):
	if claim.photo_gallery_overridden:
		return list(claim.photo_references or [])

	from .source_listings import get_source_place_payload

	payload = get_source_place_payload(claim.listing_snapshot.listing_slug)
	if not payload:
		return list(claim.photo_references or [])

	return list(dict.fromkeys([
		*payload.get('image_urls', []),
		*list(claim.photo_references or []),
	]))


def send_verification_email(user, profile):
	code = profile.issue_email_verification_code(force=True)
	token = profile.ensure_verification_token(force=True)
	profile.email_verification_sent_at = profile.email_verification_code_sent_at or timezone.now()
	profile.save(update_fields=['email_verification_token', 'email_verification_code', 'email_verification_code_sent_at', 'email_verification_sent_at', 'updated_at'])
	verification_base = str(getattr(settings, 'PROFILE_EMAIL_VERIFICATION_URL_BASE', '') or '').rstrip('/')
	verification_url = f'{verification_base}/{token}/'
	html_message = (
		f'<p>Hi {escape(user.first_name or user.username)},</p>'
		f'<p>Your DiningDealz verification code is <strong>{escape(code)}</strong>.</p>'
		'<p>Enter that code in the app within 60 seconds, or request a new one.</p>'
		'<p>You can also verify your email by opening the link below.</p>'
		f'<p><a href="{escape(verification_url)}">Verify your email</a></p>'
		'<p>If you did not create this account, you can ignore this email.</p>'
	)
	send_mail(
		subject='Verify your DiningDealz email',
		message=(
			f'Hi {user.first_name or user.username},\n\n'
			f'Your DiningDealz verification code is {code}. Enter it in the app within 60 seconds, or request a new one.\n\n'
			f'You can also verify your email for DiningDealz by opening this link:\n{verification_url}\n\n'
			'If you did not create this account, you can ignore this email.'
		),
		html_message=html_message,
		from_email=_get_branded_from_email(),
		recipient_list=[user.email],
		fail_silently=False,
	)
	return verification_url


def send_email_change_reverted_email(user, previous_email, attempted_email):
	html_message = (
		f'<p>Hi {escape(user.first_name or user.username)},</p>'
		f'<p>Your requested DiningDealz email change to <strong>{escape(attempted_email)}</strong> was not completed within 24 hours.</p>'
		f'<p>Your profile has been restored to your previously verified email address: <strong>{escape(previous_email)}</strong>.</p>'
		'<p>You may log in as normal.</p>'
	)
	send_mail(
		subject='Your DiningDealz email change was reverted',
		message=(
			f'Hi {user.first_name or user.username},\n\n'
			f'Your requested DiningDealz email change to {attempted_email} was not completed within 24 hours.\n\n'
			f'Your profile has been restored to your previously verified email address: {previous_email}.\n\n'
			'You may log in as normal.'
		),
		html_message=html_message,
		from_email=_get_branded_from_email(),
		recipient_list=[previous_email],
		fail_silently=False,
	)


def reconcile_expired_email_change(user, profile=None):
	profile = profile or get_or_create_account_profile(user)
	if not profile.pending_email_change_is_expired():
		return False

	previous_email = profile.previous_verified_email.strip().lower()
	attempted_email = profile.pending_email.strip().lower() or user.email
	if previous_email and user.email != previous_email:
		user.email = previous_email
		user.save(update_fields=['email'])

	profile.email_verified_at = timezone.now()
	profile.email_verification_token = ''
	profile.clear_email_verification_code()
	profile.email_verification_sent_at = None
	profile.clear_pending_email_change()
	profile.save(update_fields=['email_verified_at', 'email_verification_token', 'email_verification_code', 'email_verification_code_sent_at', 'email_verification_sent_at', 'pending_email', 'previous_verified_email', 'email_change_requested_at', 'updated_at'])

	if previous_email:
		send_email_change_reverted_email(user, previous_email, attempted_email)
	return True


def send_business_claim_received_email(user, claim):
	if claim is None or claim.status not in {
		BusinessClaim.Status.DRAFT,
		BusinessClaim.Status.SUBMITTED,
		BusinessClaim.Status.UNDER_REVIEW,
		BusinessClaim.Status.NEEDS_INFO,
		BusinessClaim.Status.REJECTED,
	}:
		return

	business_name = claim.listing_snapshot.name
	html_message = (
		f'<p>Hi {escape(user.first_name or user.username)},</p>'
		f'<p>DiningDealz has received your business profile creation claim for <strong>{escape(business_name)}</strong>.</p>'
		'<p>Your email is now verified. Our team will review the claim and send you an approval or rejection email after review is complete.</p>'
		'<p>You will not receive business access until the claim is approved.</p>'
	)
	send_mail(
		subject='DiningDealz received your business profile claim',
		message=(
			f'Hi {user.first_name or user.username},\n\n'
			f'DiningDealz has received your business profile creation claim for {business_name}.\n\n'
			'Your email is now verified. Our team will review the claim and send you an approval or rejection email after review is complete.\n\n'
			'You will not receive business access until the claim is approved.'
		),
		html_message=html_message,
		from_email=_get_branded_from_email(),
		recipient_list=[user.email],
		fail_silently=False,
	)


def send_business_claim_approved_email(user, claim):
	app_link = str(getattr(settings, 'PROFILE_APP_LINK_URL', '') or '').strip()
	business_name = claim.listing_snapshot.name
	app_link_html = f'<p><a href="{escape(app_link)}">Open DiningDealz</a></p>' if app_link else ''
	app_link_text = f'\n\nOpen DiningDealz: {app_link}' if app_link else ''
	html_message = (
		f'<p>Hi {escape(user.first_name or user.username)},</p>'
		f'<p>Your business profile claim for <strong>{escape(business_name)}</strong> has been approved.</p>'
		'<p>You can now sign in to DiningDealz and manage your business profile.</p>'
		f'{app_link_html}'
	)
	send_mail(
		subject='Your DiningDealz business profile was approved',
		message=(
			f'Hi {user.first_name or user.username},\n\n'
			f'Your business profile claim for {business_name} has been approved.\n\n'
			'You can now sign in to DiningDealz and manage your business profile.'
			f'{app_link_text}'
		),
		html_message=html_message,
		from_email=_get_branded_from_email(),
		recipient_list=[user.email],
		fail_silently=False,
	)


def _build_claim_submission_summary_lines(claim):
	lines = []
	contact_fields = [
		('Contact name', claim.contact_name),
		('Job title', claim.job_title),
		('Work email', claim.work_email),
		('Work phone', claim.work_phone),
		('Employer address', claim.employer_address),
		('Business website', claim.business_website_url),
		('Supporting details', claim.supporting_details),
	]
	for label, value in contact_fields:
		if str(value or '').strip():
			lines.append(f'{label}: {value}')

	for document_key, document_label in (
		('business_registration', 'Business registration entries'),
		('health_permit', 'Health permit entries'),
		('abc_license', 'ABC license entries'),
		('proof_of_address_control', 'Address control entries'),
	):
		values = list((claim.verification_documents or {}).get(document_key, []))
		if values:
			lines.append(f'{document_label}: {", ".join(values)}')

	for entry_kind, label in (
		(BusinessClaim.ProfileEntryKind.SOCIAL_MEDIA_LINK, 'Social links'),
		(BusinessClaim.ProfileEntryKind.OFFER, 'Offer entries'),
		(BusinessClaim.ProfileEntryKind.OPERATING_HOUR, 'Hours of operation'),
		(BusinessClaim.ProfileEntryKind.PHOTO_REFERENCE, 'Photo references'),
	):
		values = claim.get_profile_entry_values(entry_kind)
		if values:
			lines.append(f'{label}: {", ".join(values)}')

	attachment_summary = []
	for attachment in claim.attachments.order_by('attachment_kind', 'created_at'):
		attachment_summary.append(f'{attachment.get_attachment_kind_display()}: {attachment.original_filename}')
	if attachment_summary:
		lines.append(f'Submitted file uploads: {"; ".join(attachment_summary)}')

	return lines


def send_business_claim_rejected_email(user, claim):
	business_name = claim.listing_snapshot.name
	reviewer_notes = str(claim.reviewer_notes or '').strip()
	rejection_reason_labels = claim.get_rejection_reason_labels()
	reapply_guidance_lines = claim.get_reapply_guidance_lines()
	submission_summary_lines = _build_claim_submission_summary_lines(claim)
	reasons_html = ''.join(f'<li>{escape(label)}</li>' for label in rejection_reason_labels)
	reasons_text = '\n'.join(f'- {label}' for label in rejection_reason_labels)
	reapply_html = ''.join(f'<li>{escape(line)}</li>' for line in reapply_guidance_lines)
	reapply_text = '\n'.join(f'- {line}' for line in reapply_guidance_lines)
	summary_html = ''.join(f'<li>{escape(line)}</li>' for line in submission_summary_lines)
	summary_text = '\n'.join(f'- {line}' for line in submission_summary_lines)
	additional_notes_html = f'<p><strong>Additional reviewer explanation:</strong> {escape(reviewer_notes)}</p>' if reviewer_notes else ''
	additional_notes_text = f'Additional reviewer explanation: {reviewer_notes}\n\n' if reviewer_notes else ''
	html_message = (
		f'<p>Hi {escape(user.first_name or user.username)},</p>'
		f'<p>Your business profile claim for <strong>{escape(business_name)}</strong> was rejected after review.</p>'
		'<p><strong>Review reasons:</strong></p>'
		f'<ul>{reasons_html}</ul>'
		f'{additional_notes_html}'
		'<p>If you wish to try again, you must go through the registration process again and resubmit with the following items corrected, adjusted, or more clearly explained:</p>'
		f'<ul>{reapply_html}</ul>'
		'<p>The following submitted documents and text-field entries were part of the rejected review:</p>'
		f'<ul>{summary_html}</ul>'
	)
	send_mail(
		subject='Your DiningDealz business profile was rejected',
		message=(
			f'Hi {user.first_name or user.username},\n\n'
			f'Your business profile claim for {business_name} was rejected after review.\n\n'
			'Review reasons:\n'
			f'{reasons_text}\n\n'
			f'{additional_notes_text}'
			'If you wish to try again, you must go through the registration process again and resubmit with the following items corrected, adjusted, or more clearly explained:\n'
			f'{reapply_text}\n\n'
			'The following submitted documents and text-field entries were part of the rejected review:\n'
			f'{summary_text}'
		),
		html_message=html_message,
		from_email=_get_branded_from_email(),
		recipient_list=[user.email],
		fail_silently=False,
	)


def send_username_reminder_email(user):
	html_message = (
		f'<p>Hi {escape(user.first_name or user.username)},</p>'
		'<p>You requested a reminder for your DiningDealz username.</p>'
		f'<p><strong>Username:</strong> {escape(user.username)}</p>'
		'<p>If you did not request this reminder, you can ignore this email.</p>'
	)
	send_mail(
		subject='Your DiningDealz username',
		message=(
			f'Hi {user.first_name or user.username},\n\n'
			'You requested a reminder for your DiningDealz username.\n\n'
			f'Username: {user.username}\n\n'
			'If you did not request this reminder, you can ignore this email.'
		),
		html_message=html_message,
		from_email=_get_branded_from_email(),
		recipient_list=[user.email],
		fail_silently=False,
	)


def send_password_reset_email(user, profile):
	token = profile.issue_password_reset_token(force=True)
	profile.password_reset_sent_at = timezone.now()
	profile.save(update_fields=['password_reset_token', 'password_reset_sent_at', 'updated_at'])
	reset_base = str(getattr(settings, 'PROFILE_PASSWORD_RESET_URL_BASE', '') or '').rstrip('/')
	reset_url = f'{reset_base}/{token}/'
	html_message = (
		f'<p>Hi {escape(user.first_name or user.username)},</p>'
		'<p>Use the link below to reset your DiningDealz password.</p>'
		f'<p><a href="{escape(reset_url)}">Reset your password</a></p>'
		'<p>If you did not request a password reset, you can ignore this email.</p>'
	)
	send_mail(
		subject='Reset your DiningDealz password',
		message=(
			f'Hi {user.first_name or user.username},\n\n'
			'Use this link to reset your DiningDealz password:\n'
			f'{reset_url}\n\n'
			'If you did not request a password reset, you can ignore this email.'
		),
		html_message=html_message,
		from_email=_get_branded_from_email(),
		recipient_list=[user.email],
		fail_silently=False,
	)
	return reset_url


def send_support_contact_email(user, message, portal=None, subject=''):
	resolved_portal = infer_portal_for_user(user, portal)
	display_name = (f'{user.first_name} {user.last_name}').strip() or user.username
	normalized_subject = str(subject or '').strip() or 'DiningDealz support request'
	account_type_label = 'Business' if resolved_portal == 'business' else 'Customer'
	normalized_message = str(message or '').strip()
	body_lines = [
		'New in-app DiningDealz support request',
		'',
		f'Name: {display_name}',
		f'Username: {user.username}',
		f'Email: {user.email}',
		f'Account type: {account_type_label}',
		'',
		'Message:',
		normalized_message,
	]
	html_message = (
		'<p>New in-app DiningDealz support request</p>'
		'<ul>'
		f'<li><strong>Name:</strong> {escape(display_name)}</li>'
		f'<li><strong>Username:</strong> {escape(user.username)}</li>'
		f'<li><strong>Email:</strong> {escape(user.email)}</li>'
		f'<li><strong>Account type:</strong> {escape(account_type_label)}</li>'
		'</ul>'
		f'<p><strong>Message:</strong></p><p>{escape(normalized_message).replace(chr(10), "<br />")}</p>'
	)
	send_mail(
		subject=f'DiningDealz support: {normalized_subject}',
		message='\n'.join(body_lines),
		html_message=html_message,
		from_email=_get_branded_from_email(),
		recipient_list=[_get_support_contact_email()],
		fail_silently=False,
	)


def _default_billing_portal_url(user):
	if user.business_claims.exists() or user.business_memberships.exists():
		return str(getattr(settings, 'PROFILE_BILLING_PORTAL_URL', '') or '').strip()
	return ''