from django.conf import settings
from django.core.mail import send_mail
from django.utils.html import escape
from django.utils import timezone

from places.models import AccountProfile, BusinessClaim, ProfileAuthToken, VenueType


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
	if user.business_claims.exists() or user.business_memberships.exists():
		return 'business'
	return 'customer'


def build_account_response(user, portal, claim=None, token=None):
	claims = list(user.business_claims.select_related('listing_snapshot').order_by('-created_at'))
	memberships = list(user.business_memberships.select_related('claim__listing_snapshot').all())
	active_membership = next((membership for membership in memberships if membership.is_active), None)
	primary_claim = claim or (claims[0] if claims else None)
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
			'name': membership.claim.listing_snapshot.name,
			'city': membership.claim.listing_snapshot.city,
			'city_label': membership.claim.listing_snapshot.get_city_display() if membership.claim.listing_snapshot.city else '',
			'venue_type': membership.claim.listing_snapshot.venue_type,
			'venue_type_label': membership.claim.listing_snapshot.get_venue_type_display() if membership.claim.listing_snapshot.venue_type else '',
		}
		for membership in memberships
		if membership.is_active
	]

	business_contact = {}
	if primary_claim is not None:
		business_contact = {
			'contact_name': primary_claim.contact_name,
			'job_title': primary_claim.job_title,
			'work_email': primary_claim.work_email,
			'work_phone': primary_claim.work_phone,
			'employer_address': primary_claim.employer_address,
			'verification_summary': primary_claim.verification_summary,
		}

	tracked_business_location = {}
	requires_business_location_tracking = False
	tracked_snapshot = active_membership.claim.listing_snapshot if active_membership else (primary_claim.listing_snapshot if primary_claim else None)
	if tracked_snapshot is not None and (tracked_snapshot.venue_type == VenueType.MOBILE or tracked_snapshot.serves_multiple_areas):
		requires_business_location_tracking = True
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
		'business_name': active_membership.claim.listing_snapshot.name if active_membership else (primary_claim.listing_snapshot.name if primary_claim else ''),
		'email_verified': profile.email_is_verified,
		'email_verification_sent_at': profile.email_verification_sent_at,
		'two_factor_enabled': profile.two_factor_enabled,
		'two_factor_pending_setup': bool(profile.two_factor_pending_secret and not profile.two_factor_enabled),
		'billing_portal_url': profile.billing_portal_url if profile_type == 'business' else '',
		'approved_businesses': approved_businesses,
		'business_contact': business_contact,
		'requires_business_location_tracking': requires_business_location_tracking,
		'tracked_business_location': tracked_business_location,
		'can_access_places': True,
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


def send_verification_email(user, profile):
	code = profile.issue_email_verification_code(force=True)
	token = profile.ensure_verification_token(force=True)
	profile.email_verification_sent_at = profile.email_verification_code_sent_at or timezone.now()
	profile.save(update_fields=['email_verification_token', 'email_verification_code', 'email_verification_code_sent_at', 'email_verification_sent_at', 'updated_at'])
	verification_base = str(getattr(settings, 'PROFILE_EMAIL_VERIFICATION_URL_BASE', '') or '').rstrip('/')
	verification_url = f'{verification_base}/{token}/'
	html_message = (
		f'<p>Hi {escape(user.first_name or user.username)},</p>'
		f'<p>Your HappyHourApp verification code is <strong>{escape(code)}</strong>.</p>'
		'<p>Enter that code in the app within 60 seconds, or request a new one.</p>'
		'<p>You can also verify your email by opening the link below.</p>'
		f'<p><a href="{escape(verification_url)}">Verify your email</a></p>'
		'<p>If you did not create this account, you can ignore this email.</p>'
	)
	send_mail(
		subject='Verify your HappyHourApp email',
		message=(
			f'Hi {user.first_name or user.username},\n\n'
			f'Your HappyHourApp verification code is {code}. Enter it in the app within 60 seconds, or request a new one.\n\n'
			f'You can also verify your email for HappyHourApp by opening this link:\n{verification_url}\n\n'
			'If you did not create this account, you can ignore this email.'
		),
		html_message=html_message,
		from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@happyhourapp.local'),
		recipient_list=[user.email],
		fail_silently=False,
	)
	return verification_url


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
		from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@happyhourapp.local'),
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
		from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@happyhourapp.local'),
		recipient_list=[user.email],
		fail_silently=False,
	)
	return reset_url


def _default_billing_portal_url(user):
	if user.business_claims.exists() or user.business_memberships.exists():
		return str(getattr(settings, 'PROFILE_BILLING_PORTAL_URL', '') or '').strip()
	return ''