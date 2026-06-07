import { NativeModules } from 'react-native';

import type {
  BusinessAttachmentDraft,
  BusinessAttachmentBuckets,
  BusinessAttachmentKind,
  BusinessLocationTrackingPreferenceRequest,
  BusinessLocationUpdateRequest,
  BusinessSignupRequest,
  CustomerSignupRequest,
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
  ResendEmailVerificationCodeRequest,
  SignupResponse,
  SupportContactRequest,
  TwoFactorSetupResponse,
} from './types';

const FALLBACK_API_BASE_URL = 'http://127.0.0.1:8000/api';

const businessAttachmentFieldNames: Record<BusinessAttachmentKind, string> = {
  social_media: 'social_media_attachments',
  business_registration: 'business_registration_attachments',
  health_permit: 'health_permit_attachments',
  abc_license: 'abc_license_attachments',
  proof_of_address_control: 'proof_of_address_control_attachments',
  proof_of_authority: 'proof_of_authority_attachments',
};

export function getDefaultApiBaseUrl() {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (configured) {
    return normalizeApiBaseUrl(configured);
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
    return FALLBACK_API_BASE_URL;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withProtocol.endsWith('/api') ? withProtocol : `${withProtocol}/api`;
}

export async function fetchPlaces(baseUrl: string, city: string, hasDeals?: boolean) {
  const queryParams = new URLSearchParams();
  queryParams.set('page_size', '500');

  if (city !== 'all') {
    queryParams.set('city', city);
  }

  if (typeof hasDeals === 'boolean') {
    queryParams.set('has_deals', hasDeals ? 'true' : 'false');
  }

  const query = queryParams.size ? `?${queryParams.toString()}` : '';
  return fetchAllPaginatedJson<PlaceListItem>(baseUrl, `/places/${query}`);
}

export async function fetchPlaceDetail(baseUrl: string, slug: string) {
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

  return postAuthedMultipartJson<SignupResponse>(baseUrl, '/profiles/me/', authToken, formData);
}

export async function submitSupportRequest(baseUrl: string, authToken: string, payload: SupportContactRequest) {
  return postAuthedJson<{ detail: string }>(baseUrl, '/profiles/contact-support/', authToken, payload);
}

export async function toggleFavoriteBusiness(baseUrl: string, authToken: string, payload: FavoriteBusinessToggleRequest) {
  return postAuthedJson<SignupResponse>(baseUrl, '/profiles/favorites/', authToken, payload);
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
    throw new Error(`Backend request failed with status ${response.status}.`);
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
      : `Backend request failed with status ${response.status}.`;
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
      : `Backend request failed with status ${response.status}.`;
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
      throw new Error(`Backend request failed with status ${response.status}.`);
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
    throw new Error(`Backend request failed with status ${response.status}.`);
  }

  return response.json() as Promise<PaginatedResponse<T>>;
}

function buildApiUrl(baseUrl: string, path: string) {
  return `${normalizeApiBaseUrl(baseUrl)}${path}`;
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

function flattenApiError(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => flattenApiError(entry)).join(' ');
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => formatApiErrorEntry(key, entry))
      .filter(Boolean)
      .join(' ');
  }

  return typeof value === 'string' ? value : 'Unable to complete the request.';
}

function formatApiErrorEntry(key: string, entry: unknown) {
  const message = flattenApiError(entry).trim();
  if (!message) {
    return '';
  }

  if (key === 'non_field_errors' || key === 'detail') {
    return message;
  }

  return `${formatApiErrorLabel(key)}: ${message}`;
}

function formatApiErrorLabel(key: string) {
  const normalizedKey = key.replace(/_/g, ' ').trim();
  if (!normalizedKey) {
    return 'Error';
  }

  return normalizedKey.charAt(0).toUpperCase() + normalizedKey.slice(1);
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