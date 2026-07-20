import { NativeModules } from 'react-native';

import type {
  BusinessAttachmentDraft,
  BusinessAttachmentBuckets,
  BusinessAttachmentKind,
  BusinessDealOverride,
  BusinessLocationTrackingPreferenceRequest,
  BusinessLocationUpdateRequest,
  BusinessSignupRequest,
  CustomerSignupRequest,
  DirectMessageSendResponse,
  DirectMessageSendRequest,
  DirectMessageThreadDetailResponse,
  DirectMessageThreadsResponse,
  EmailVerificationChallengeResponse,
  EmailVerificationCodeRequest,
  FeedEngagementRequest,
  FeedItem,
  FeedImpressionRequest,
  FavoriteBusinessToggleRequest,
  InformalBusinessSignupRequest,
  LoginRequest,
  ManualBusinessSignupRequest,
  PaginatedResponse,
  PlaceDetail,
  PlaceListItem,
  ProfileDashboardUpdateRequest,
  PushDeviceRegistrationRequest,
  ResendEmailVerificationCodeRequest,
  SignupResponse,
  SupportContactRequest,
  TwoFactorSetupResponse,
} from './types';

const FALLBACK_API_BASE_URL = 'http://127.0.0.1:8000/api';
const MISSING_PRODUCTION_API_BASE_URL_MESSAGE = 'This build is missing the live backend URL. Set EXPO_PUBLIC_API_BASE_URL for production builds.';
const placeCacheTtlMs = 5 * 60 * 1000;

type PlaceCacheEntry = {
  expiresAt: number;
  places: PlaceListItem[];
};

const placeCache = new Map<string, PlaceCacheEntry>();

const businessAttachmentFieldNames: Record<BusinessAttachmentKind, string> = {
  social_media: 'social_media_attachments',
  business_registration: 'business_registration_attachments',
  health_permit: 'health_permit_attachments',
  abc_license: 'abc_license_attachments',
  proof_of_address_control: 'proof_of_address_control_attachments',
  proof_of_authority: 'proof_of_authority_attachments',
};

export function getDefaultApiBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configured) {
    return normalizeApiBaseUrl(configured);
  }

  if (!__DEV__) {
    return '';
  }

  const metroHost = getMetroHost();
  if (metroHost) {
    return `http://${metroHost}:8000/api`;
  }

  return FALLBACK_API_BASE_URL;
}

export function normalizeApiBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '');

  if (!trimmed) {
    return '';
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.endsWith('/api') ? withProtocol : `${withProtocol}/api`;
}

export function isMissingProductionApiBaseUrlError(error: unknown) {
  return error instanceof Error && error.message === MISSING_PRODUCTION_API_BASE_URL_MESSAGE;
}

function getPlaceCacheKey(baseUrl: string, city: string, hasDeals?: boolean) {
  return JSON.stringify({
    baseUrl: normalizeApiBaseUrl(baseUrl),
    city,
    hasDeals: typeof hasDeals === 'boolean' ? hasDeals : null,
  });
}

export function clearPlacesCache() {
  placeCache.clear();
}

export async function fetchPlaces(baseUrl: string, city: string, hasDeals?: boolean) {
  const cacheKey = getPlaceCacheKey(baseUrl, city, hasDeals);
  const cachedEntry = placeCache.get(cacheKey);
  const now = Date.now();
  if (cachedEntry && cachedEntry.expiresAt > now) {
    return cachedEntry.places;
  }

  const queryParams = new URLSearchParams();
  queryParams.set('page_size', '500');

  if (city !== 'all') {
    queryParams.set('city', city);
  }

  if (typeof hasDeals === 'boolean') {
    queryParams.set('has_deals', hasDeals ? 'true' : 'false');
  }

  const query = queryParams.size ? `?${queryParams.toString()}` : '';
  const nextPlaces = await fetchAllPaginatedJson<PlaceListItem>(baseUrl, `/places/${query}`);
  placeCache.set(cacheKey, {
    expiresAt: now + placeCacheTtlMs,
    places: nextPlaces,
  });
  return nextPlaces;
}

export async function fetchPlaceDetail(baseUrl: string, slug: string, authToken?: string) {
  if (authToken) {
    return fetchAuthedJson<PlaceDetail>(baseUrl, `/places/${encodeURIComponent(slug)}/`, authToken);
  }
  return fetchJson<PlaceDetail>(baseUrl, `/places/${encodeURIComponent(slug)}/`);
}

export async function fetchHomeFeed(
  baseUrl: string,
  options: {
    page?: number;
    pageSize?: number;
    city?: string;
    types?: string[];
  } = {},
) {
  const queryParams = new URLSearchParams();
  queryParams.set('page', String(options.page ?? 1));
  queryParams.set('page_size', String(options.pageSize ?? 12));

  if (options.city && options.city !== 'all') {
    queryParams.set('city', options.city);
  }

  if (options.types?.length) {
    queryParams.set('types', options.types.join(','));
  }

  return fetchPagedJson<FeedItem>(baseUrl, `/feed/?${queryParams.toString()}`);
}

export async function recordFeedImpression(baseUrl: string, payload: FeedImpressionRequest) {
  return postJson<{ id: number }>(baseUrl, '/feed/impressions/', payload);
}

export async function recordFeedEngagement(baseUrl: string, payload: FeedEngagementRequest) {
  return postJson<{ id: number }>(baseUrl, '/feed/engagements/', payload);
}

export async function createCustomerProfile(baseUrl: string, payload: CustomerSignupRequest) {
  return postJson<EmailVerificationChallengeResponse>(baseUrl, '/profiles/customer-signup/', payload);
}

export async function loginProfile(baseUrl: string, payload: LoginRequest) {
  return postJson<EmailVerificationChallengeResponse>(baseUrl, '/profiles/login/', payload);
}

export async function fetchProfileDashboard(baseUrl: string, authToken: string, portal?: 'customer' | 'business') {
  const query = portal ? `?portal=${encodeURIComponent(portal)}` : '';
  return fetchAuthedJson<SignupResponse>(baseUrl, `/profiles/me/${query}`, authToken);
}

export async function updateProfileDashboard(baseUrl: string, authToken: string, payload: ProfileDashboardUpdateRequest) {
  return postAuthedJson<SignupResponse>(baseUrl, '/profiles/me/', authToken, payload);
}

export async function updateProfileDashboardWithUploads(
  baseUrl: string,
  authToken: string,
  payload: ProfileDashboardUpdateRequest,
  photoUploads: BusinessAttachmentDraft[],
) {
  const formData = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    appendMultipartValue(formData, key, value);
  });

  photoUploads.forEach((photoUpload) => {
    formData.append('profile_photo_uploads', {
      uri: photoUpload.uri,
      name: photoUpload.name,
      type: photoUpload.mimeType ?? 'image/jpeg',
    } as any);
  });

  appendDealAttachmentUploads(formData, payload.deal_overrides);

  return postAuthedMultipartJson<SignupResponse>(baseUrl, '/profiles/me/', authToken, formData);
}

export async function submitSupportRequest(baseUrl: string, authToken: string, payload: SupportContactRequest) {
  return postAuthedJson<{ detail: string }>(baseUrl, '/profiles/contact-support/', authToken, payload);
}

export async function toggleFavoriteBusiness(baseUrl: string, authToken: string, payload: FavoriteBusinessToggleRequest) {
  return postAuthedJson<SignupResponse>(baseUrl, '/profiles/favorites/', authToken, payload);
}

export async function sendDirectMessage(baseUrl: string, authToken: string, payload: DirectMessageSendRequest) {
  return postAuthedJson<DirectMessageSendResponse>(baseUrl, '/profiles/direct-messages/', authToken, payload);
}

export async function sendDirectMessageImage(baseUrl: string, authToken: string, payload: {
  portal: 'business';
  thread_id: number;
  image: BusinessAttachmentDraft;
}) {
  const formData = new FormData();
  formData.append('portal', payload.portal);
  formData.append('thread_id', String(payload.thread_id));
  formData.append('image', {
    uri: payload.image.uri,
    name: payload.image.name,
    type: payload.image.mimeType ?? 'image/jpeg',
  } as any);
  return postAuthedMultipartJson<DirectMessageSendResponse>(baseUrl, '/profiles/direct-messages/', authToken, formData);
}

export async function fetchDirectMessageThreads(baseUrl: string, authToken: string, portal: 'customer' | 'business') {
  const response = await fetchAuthedJson<DirectMessageThreadsResponse>(baseUrl, `/profiles/direct-messages/?portal=${encodeURIComponent(portal)}`, authToken);
  return response.threads ?? [];
}

export async function fetchDirectMessageThreadDetail(baseUrl: string, authToken: string, threadId: number, portal: 'customer' | 'business') {
  return fetchAuthedJson<DirectMessageThreadDetailResponse>(
    baseUrl,
    `/profiles/direct-messages/threads/${threadId}/?portal=${encodeURIComponent(portal)}`,
    authToken,
  );
}

export async function deleteBusinessDirectMessageThread(baseUrl: string, authToken: string, threadId: number) {
  return deleteAuthedJson<{ detail: string }>(
    baseUrl,
    `/profiles/direct-messages/threads/${threadId}/?portal=business`,
    authToken,
  );
}

export async function blockBusinessDirectMessagesForCustomer(baseUrl: string, authToken: string, customerUsername: string) {
  return postAuthedJson<SignupResponse>(baseUrl, '/profiles/direct-message-blocks/', authToken, {
    portal: 'business',
    customer_username: customerUsername,
  });
}

export async function unblockBusinessDirectMessagesForCustomer(baseUrl: string, authToken: string, blockId: number) {
  return deleteAuthedJson<SignupResponse>(baseUrl, `/profiles/direct-message-blocks/${blockId}/?portal=business`, authToken);
}

export async function registerPushDevice(baseUrl: string, authToken: string, payload: PushDeviceRegistrationRequest) {
  return postAuthedJson<{ detail: string }>(baseUrl, '/profiles/push-devices/', authToken, payload);
}

export async function clearFavoriteBusinessNotifications(baseUrl: string, authToken: string, portal?: 'customer' | 'business') {
  return postAuthedJson<SignupResponse>(baseUrl, '/profiles/favorite-business-notifications/', authToken, { portal });
}

export async function clearFavoriteBusinessNotification(baseUrl: string, authToken: string, notificationId: number, portal?: 'customer' | 'business') {
  const query = portal ? `?portal=${encodeURIComponent(portal)}` : '';
  return deleteAuthedJson<SignupResponse>(baseUrl, `/profiles/favorite-business-notifications/${notificationId}/${query}`, authToken);
}

export async function resendVerificationEmail(baseUrl: string, authToken: string) {
  return postAuthedJson<{ detail: string }>(baseUrl, '/profiles/resend-verification/', authToken, {});
}

export async function requestUsernameReminder(baseUrl: string, email: string) {
  return postJson<{ detail: string }>(baseUrl, '/profiles/recover-username/', { email });
}

export async function requestPasswordReset(baseUrl: string, identifier: string) {
  return postJson<{ detail: string }>(baseUrl, '/profiles/password-reset-request/', { identifier });
}

export async function beginTwoFactorSetup(baseUrl: string, authToken: string) {
  return postAuthedJson<TwoFactorSetupResponse>(baseUrl, '/profiles/two-factor/', authToken, {});
}

export async function confirmTwoFactorSetup(baseUrl: string, authToken: string, code: string, portal?: 'customer' | 'business') {
  return postAuthedJson<SignupResponse>(baseUrl, '/profiles/two-factor/confirm/', authToken, { code, portal });
}

export async function disableTwoFactor(baseUrl: string, authToken: string, code: string, portal?: 'customer' | 'business') {
  return postAuthedJson<SignupResponse>(baseUrl, '/profiles/two-factor/disable/', authToken, { code, portal });
}

export async function deleteProfileAccount(baseUrl: string, authToken: string, password: string) {
  return postAuthedJson<{ detail: string }>(baseUrl, '/profiles/delete-account/', authToken, { password });
}

export async function createBusinessProfile(baseUrl: string, payload: BusinessSignupRequest, authToken?: string) {
  return postMultipartJson<EmailVerificationChallengeResponse>(baseUrl, '/profiles/business-signup/', buildBusinessSignupFormData(payload), authToken);
}

export async function createManualBusinessProfile(baseUrl: string, payload: ManualBusinessSignupRequest) {
  return postMultipartJson<EmailVerificationChallengeResponse>(baseUrl, '/profiles/manual-business-signup/', buildBusinessSignupFormData(payload));
}

export async function createInformalBusinessProfile(baseUrl: string, payload: InformalBusinessSignupRequest) {
  return postMultipartJson<EmailVerificationChallengeResponse>(baseUrl, '/profiles/informal-business-signup/', buildBusinessSignupFormData(payload));
}

export async function updateBusinessLocation(baseUrl: string, authToken: string, payload: BusinessLocationUpdateRequest) {
  return postAuthedJson<SignupResponse>(baseUrl, '/profiles/business-location/', authToken, payload);
}

export async function updateBusinessLocationTrackingPreference(baseUrl: string, authToken: string, payload: BusinessLocationTrackingPreferenceRequest) {
  return postAuthedJson<SignupResponse>(baseUrl, '/profiles/business-location-preference/', authToken, payload);
}

export async function verifyEmailCode(baseUrl: string, payload: EmailVerificationCodeRequest) {
  return postJson<SignupResponse>(baseUrl, '/profiles/verify-email-code/', payload);
}

export async function resendVerificationCode(baseUrl: string, payload: ResendEmailVerificationCodeRequest) {
  return postJson<EmailVerificationChallengeResponse>(baseUrl, '/profiles/resend-verification-code/', payload);
}

async function fetchJson<T>(baseUrl: string, path: string): Promise<T> {
  const response = await fetch(buildApiUrl(baseUrl, path), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(buildFriendlyApiFallbackMessage(path, response.status));
  }

  return response.json() as Promise<T>;
}

async function postJson<T>(baseUrl: string, path: string, payload: object): Promise<T> {
  const response = await fetch(buildApiUrl(baseUrl, path), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    const message = errorPayload && typeof errorPayload === 'object'
      ? flattenApiError(errorPayload)
      : buildFriendlyApiFallbackMessage(path, response.status);
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

async function postMultipartJson<T>(baseUrl: string, path: string, payload: FormData, authToken?: string): Promise<T> {
  const response = await fetch(buildApiUrl(baseUrl, path), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(authToken ? { Authorization: `Token ${authToken}` } : {}),
    },
    body: payload,
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    const message = errorPayload && typeof errorPayload === 'object'
      ? flattenApiError(errorPayload)
      : buildFriendlyApiFallbackMessage(path, response.status);
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

async function deleteAuthedJson<T>(baseUrl: string, path: string, authToken: string): Promise<T> {
  const response = await fetch(buildApiUrl(baseUrl, path), {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      Authorization: `Token ${authToken}`,
    },
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    const message = errorPayload && typeof errorPayload === 'object'
      ? flattenApiError(errorPayload)
      : buildFriendlyApiFallbackMessage(path, response.status);
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

async function fetchAllPaginatedJson<T>(baseUrl: string, path: string): Promise<T[]> {
  const items: T[] = [];
  let nextUrl: string | null = buildApiUrl(baseUrl, path);

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(buildFriendlyApiFallbackMessage(path, response.status));
    }

    const payload = await response.json() as PaginatedResponse<T>;
    items.push(...payload.results);
    nextUrl = payload.next;
  }

  return items;
}

async function fetchPagedJson<T>(baseUrl: string, path: string): Promise<PaginatedResponse<T>> {
  const response = await fetch(buildApiUrl(baseUrl, path), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(buildFriendlyApiFallbackMessage(path, response.status));
  }

  return response.json() as Promise<PaginatedResponse<T>>;
}

function buildApiUrl(baseUrl: string, path: string) {
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    throw new Error(MISSING_PRODUCTION_API_BASE_URL_MESSAGE);
  }
  return `${normalizedBaseUrl}${path}`;
}

function buildBusinessSignupFormData(payload: BusinessSignupRequest | ManualBusinessSignupRequest | InformalBusinessSignupRequest) {
  const formData = new FormData();
  const { attachments, photo_uploads, ...rest } = payload;

  Object.entries(rest).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    appendMultipartValue(formData, key, value);
  });

  appendBusinessAttachments(formData, attachments);
  appendBusinessPhotoUploads(formData, photo_uploads);
  appendDealAttachmentUploads(formData, payload.deal_overrides);
  return formData;
}

function appendBusinessAttachments(formData: FormData, attachments?: BusinessAttachmentBuckets) {
  if (!attachments) {
    return;
  }

  (Object.entries(attachments) as Array<[BusinessAttachmentKind, BusinessAttachmentBuckets[BusinessAttachmentKind]]>).forEach(([attachmentKind, files]) => {
    const fieldName = businessAttachmentFieldNames[attachmentKind];
    files.forEach((file) => {
      formData.append(fieldName, {
        uri: file.uri,
        name: file.name,
        type: file.mimeType ?? 'application/octet-stream',
      } as any);
    });
  });
}

function appendBusinessPhotoUploads(formData: FormData, photoUploads?: BusinessAttachmentDraft[]) {
  if (!photoUploads?.length) {
    return;
  }

  photoUploads.forEach((photoUpload) => {
    formData.append('profile_photo_uploads', {
      uri: photoUpload.uri,
      name: photoUpload.name,
      type: photoUpload.mimeType ?? 'image/jpeg',
    } as any);
  });
}

function appendDealAttachmentUploads(formData: FormData, dealOverrides?: BusinessDealOverride[]) {
  if (!dealOverrides?.length) {
    return;
  }

  dealOverrides.forEach((dealOverride, index) => {
    const attachmentUpload = dealOverride.attachment_upload;
    if (!attachmentUpload?.uri) {
      return;
    }

    formData.append(`deal_attachment_upload_${index}`, {
      uri: attachmentUpload.uri,
      name: attachmentUpload.name,
      type: attachmentUpload.mimeType ?? 'application/octet-stream',
    } as any);
  });
}

function flattenApiError(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => flattenApiError(entry)).filter(Boolean).join('\n');
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => formatApiErrorEntry(key, entry))
      .filter(Boolean)
      .join('\n');
  }

  return typeof value === 'string' ? value : 'Unable to complete the request.';
}

function formatApiErrorEntry(key: string, entry: unknown) {
  const message = sanitizeApiErrorMessage(key, flattenApiError(entry).trim());
  if (!message) {
    return '';
  }

  if (key === 'non_field_errors' || key === 'detail') {
    return message;
  }

  return `${formatApiErrorLabel(key)}: ${message}`;
}

function formatApiErrorLabel(key: string) {
  const friendlyLabels: Record<string, string> = {
    identifier: 'Username',
    username: 'Username',
    email: 'Email',
    password: 'Password',
    confirm_password: 'Confirm password',
    first_name: 'First name',
    last_name: 'Last name',
    business_name: 'Business name',
    business_city: 'Business city',
    business_venue_type: 'Business type',
    contact_name: 'Contact name',
    job_title: 'Role',
    work_email: 'Employer email',
    work_phone: 'Work phone',
    employer_address: 'Employer address',
    verification_summary: 'Verification summary',
    supporting_details: 'Supporting details',
    business_slug: 'Business',
    code: 'Verification code',
    two_factor_code: 'Authenticator code',
  };
  const friendlyLabel = friendlyLabels[key];
  if (friendlyLabel) {
    return friendlyLabel;
  }

  const normalizedKey = key.replace(/_/g, ' ').trim();
  if (!normalizedKey) {
    return 'Error';
  }

  return normalizedKey.charAt(0).toUpperCase() + normalizedKey.slice(1);
}

function sanitizeApiErrorMessage(key: string, message: string) {
  if (!message) {
    return '';
  }

  const label = formatApiErrorLabel(key);
  const lowerLabel = label.charAt(0).toLowerCase() + label.slice(1);
  const normalizedMessage = message.replace(/\s+/g, ' ').trim();

  if (normalizedMessage === 'This field may not be blank.' || normalizedMessage === 'This field is required.') {
    return `Enter ${lowerLabel}.`;
  }

  if (/^"" is not a valid choice\.$/.test(normalizedMessage)) {
    return `Select ${lowerLabel}.`;
  }

  return normalizedMessage;
}

function getMetroHost() {
  const scriptUrl = NativeModules.SourceCode?.scriptURL;
  if (typeof scriptUrl !== 'string') {
    return null;
  }

  const match = scriptUrl.match(/^https?:\/\/([^/:]+)/i);
  return match ? match[1] : null;
}

async function fetchAuthedJson<T>(baseUrl: string, path: string, authToken: string): Promise<T> {
  const response = await fetch(buildApiUrl(baseUrl, path), {
    headers: {
      Accept: 'application/json',
      Authorization: `Token ${authToken}`,
    },
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    const message = errorPayload && typeof errorPayload === 'object'
      ? flattenApiError(errorPayload)
      : `Backend request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

async function postAuthedJson<T>(baseUrl: string, path: string, authToken: string, payload: object): Promise<T> {
  const response = await fetch(buildApiUrl(baseUrl, path), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Token ${authToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    const message = errorPayload && typeof errorPayload === 'object'
      ? flattenApiError(errorPayload)
      : `Backend request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

async function postAuthedMultipartJson<T>(baseUrl: string, path: string, authToken: string, payload: FormData): Promise<T> {
  const response = await fetch(buildApiUrl(baseUrl, path), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Token ${authToken}`,
    },
    body: payload,
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    const message = errorPayload && typeof errorPayload === 'object'
      ? flattenApiError(errorPayload)
      : `Backend request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function appendMultipartValue(formData: FormData, key: string, value: unknown) {
  if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    formData.append(key, JSON.stringify(value));
    return;
  }

  formData.append(key, String(value));
}

function buildFriendlyApiFallbackMessage(path: string, status: number) {
  const normalizedPath = path.split('?')[0];

  if (normalizedPath === '/profiles/login/') {
    return 'We could not sign you in with those credentials. Check your username and password and try again.';
  }

  if (normalizedPath === '/profiles/customer-signup/') {
    return 'We could not create your customer account. Check your username, email, and password and try again.';
  }

  if (
    normalizedPath === '/profiles/business-signup/'
    || normalizedPath === '/profiles/manual-business-signup/'
    || normalizedPath === '/profiles/informal-business-signup/'
  ) {
    return 'We could not finish creating this business account. Check the information you entered and try again.';
  }

  if (normalizedPath === '/profiles/verify-email-code/') {
    return 'We could not verify that code. Check the 6-digit code and try again.';
  }

  if (normalizedPath === '/profiles/resend-verification-code/') {
    return 'We could not send a new verification code right now. Try again in a moment.';
  }

  if (normalizedPath === '/profiles/recover-username/') {
    return 'We could not process that email address right now. Check it and try again.';
  }

  if (normalizedPath === '/profiles/password-reset-request/') {
    return 'We could not process that username or email right now. Check it and try again.';
  }

  if (normalizedPath === '/profiles/delete-account/') {
    return 'We could not verify your password right now. Check it and try again.';
  }

  if (status >= 500) {
    return 'Something went wrong on our side. Please try again.';
  }

  return 'We could not complete that request. Check the information you entered and try again.';
}