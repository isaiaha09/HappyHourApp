import Constants from 'expo-constants';
import { File } from 'expo-file-system';
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
  CustomerPreferencesRequest,
  ContentReportRequest,
  CurrentHappyHoursResponse,
  DirectMessageSendResponse,
  DirectMessageSendRequest,
  DirectMessageThreadDetailResponse,
  DirectMessageThreadsResponse,
  EmailVerificationChallengeResponse,
  EmailVerificationCodeRequest,
  EmailVerificationResendResponse,
  FeedEngagementRequest,
  FeedItem,
  FeedImpressionRequest,
  FavoriteBusinessToggleRequest,
  InformalBusinessSignupRequest,
  LoginRequest,
  LiveLocationPlaceUpdate,
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

const MISSING_DEVELOPMENT_API_BASE_URL_MESSAGE = 'This development build is missing a local LAN backend URL. Start Metro with npm run start:wifi:xcode.';
const MISSING_PRODUCTION_API_BASE_URL_MESSAGE = 'This build is missing the live backend URL. Set EXPO_PUBLIC_API_BASE_URL for production builds.';
const MAX_PAGINATED_API_PAGES = 100;
const placeCacheTtlMs = 5 * 60 * 1000;
const API_REQUEST_TIMEOUT_MS = 15_000;
const PLACES_API_REQUEST_TIMEOUT_MS = 60_000;
const MANAGED_MEDIA_PATH_PATTERN = /^\/managed-media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/$/i;

export function resolveManagedMediaReferences<T>(payload: T, baseUrl: string): T {
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    return payload;
  }

  const apiOrigin = new URL(normalizedBaseUrl).origin;
  const visit = (value: unknown): unknown => {
    if (typeof value === 'string' && MANAGED_MEDIA_PATH_PATTERN.test(value)) {
      return new URL(value, `${apiOrigin}/`).toString();
    }
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        value[index] = visit(value[index]);
      }
      return value;
    }
    if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, entry]) => {
        (value as Record<string, unknown>)[key] = visit(entry);
      });
      return value;
    }
    return value;
  };

  return visit(payload) as T;
}

type PlaceCacheEntry = {
  expiresAt: number;
  places: PlaceListItem[];
};

const placeCache = new Map<string, PlaceCacheEntry>();
const inFlightPlaceRequests = new Map<string, Promise<PlaceListItem[]>>();

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
  const useConfiguredApiInDev = process.env.EXPO_PUBLIC_USE_REMOTE_API_IN_DEV?.trim().toLowerCase() === 'true';

  if (__DEV__ && !useConfiguredApiInDev) {
    if (configured && isLocalDevelopmentApiBaseUrl(configured)) {
      return normalizeApiBaseUrl(configured);
    }

    const metroHost = getMetroHost();
    if (metroHost && isLanHost(metroHost)) {
      return `http://${metroHost}:8000/api`;
    }

    return '';
  }

  if (configured) {
    return normalizeApiBaseUrl(configured);
  }

  if (!__DEV__) {
    return '';
  }

  return '';
}

export function normalizeApiBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '');

  if (!trimmed) {
    return '';
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error('The configured API base URL is invalid.');
  }

  if (!parsed.hostname || parsed.username || parsed.password || !['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('The configured API base URL is invalid.');
  }
  if (!__DEV__ && parsed.protocol !== 'https:') {
    throw new Error('The configured API base URL must use HTTPS in production.');
  }

  const pathname = parsed.pathname.replace(/\/+$/, '');
  const apiPath = pathname === '/api' || pathname.endsWith('/api') ? pathname : `${pathname}/api`;
  return `${parsed.origin}${apiPath || '/api'}`;
}

export function isMissingProductionApiBaseUrlError(error: unknown) {
  return error instanceof Error && (
    error.message === MISSING_DEVELOPMENT_API_BASE_URL_MESSAGE
    || error.message === MISSING_PRODUCTION_API_BASE_URL_MESSAGE
  );
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

  const inFlightRequest = inFlightPlaceRequests.get(cacheKey);
  if (inFlightRequest) {
    return inFlightRequest;
  }

  const request = (async () => {
    const queryParams = new URLSearchParams();
    queryParams.set('page_size', '500');

    if (city !== 'all') {
      queryParams.set('city', city);
    }

    if (typeof hasDeals === 'boolean') {
      queryParams.set('has_deals', hasDeals ? 'true' : 'false');
    }

    const query = queryParams.size ? `?${queryParams.toString()}` : '';
    const nextPlaces = await fetchAllPaginatedJson<PlaceListItem>(
      baseUrl,
      `/places/${query}`,
      PLACES_API_REQUEST_TIMEOUT_MS,
    );
    placeCache.set(cacheKey, {
      expiresAt: Date.now() + placeCacheTtlMs,
      places: nextPlaces,
    });
    return nextPlaces;
  })();

  inFlightPlaceRequests.set(cacheKey, request);
  try {
    return await request;
  } finally {
    if (inFlightPlaceRequests.get(cacheKey) === request) {
      inFlightPlaceRequests.delete(cacheKey);
    }
  }
}

export async function fetchLiveLocationPlaces(baseUrl: string, city: string) {
  const queryParams = new URLSearchParams();
  if (city !== 'all') {
    queryParams.set('city', city);
  }

  const query = queryParams.size ? `?${queryParams.toString()}` : '';
  return fetchJson<LiveLocationPlaceUpdate[]>(baseUrl, `/places/live-locations/${query}`);
}

export async function fetchCurrentHappyHourPlaces(baseUrl: string, city: string) {
  const queryParams = new URLSearchParams();
  if (city !== 'all') {
    queryParams.set('city', city);
  }

  const queryString = queryParams.toString();
  const query = queryString ? `?${queryString}` : '';
  return fetchJson<CurrentHappyHoursResponse>(baseUrl, `/places/current-happy-hours/${query}`);
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

export async function logoutProfile(baseUrl: string, authToken: string) {
  return postAuthedJson<{ detail: string }>(baseUrl, '/profiles/logout/', authToken, {});
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

  for (const photoUpload of photoUploads) {
    await appendLocalFilePart(formData, 'profile_photo_uploads', photoUpload, 'image/jpeg');
  }

  await appendDealAttachmentUploads(formData, payload.deal_overrides);

  return postAuthedMultipartJson<SignupResponse>(baseUrl, '/profiles/me/', authToken, formData);
}

export async function submitSupportRequest(baseUrl: string, authToken: string, payload: SupportContactRequest) {
  return postAuthedJson<{ detail: string }>(baseUrl, '/profiles/contact-support/', authToken, payload);
}

export async function submitContentReport(baseUrl: string, authToken: string, payload: ContentReportRequest) {
  const { screenshot, ...reportFields } = payload;
  if (!screenshot?.uri) {
    return postAuthedJson<{ detail: string }>(baseUrl, '/profiles/content-reports/', authToken, reportFields);
  }

  const formData = new FormData();
  Object.entries(reportFields).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    appendMultipartValue(formData, key, value);
  });
  await appendLocalFilePart(formData, 'screenshot', screenshot, 'image/jpeg');

  return postMultipartJson<{ detail: string }>(baseUrl, '/profiles/content-reports/', formData, authToken);
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
  await appendLocalFilePart(formData, 'image', payload.image, 'image/jpeg');
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

export async function blockBusinessDirectMessagesForBusiness(baseUrl: string, authToken: string, threadId: number) {
  return postAuthedJson<SignupResponse>(baseUrl, '/profiles/direct-message-blocks/', authToken, {
    portal: 'customer',
    thread_id: threadId,
  });
}

export async function unblockBusinessDirectMessagesForCustomer(baseUrl: string, authToken: string, blockId: number, portal: 'customer' | 'business' = 'business') {
  return deleteAuthedJson<SignupResponse>(baseUrl, `/profiles/direct-message-blocks/${blockId}/?portal=${portal}`, authToken);
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

export async function requestBusinessClaimRetryCode(baseUrl: string, email: string) {
  return postJson<{ detail: string }>(baseUrl, '/profiles/business-claim-retry-request/', { email });
}

export async function verifyBusinessClaimRetryCode(baseUrl: string, email: string, code: string) {
  return postJson<{ detail: string; retry_token: string }>(baseUrl, '/profiles/business-claim-retry-verify/', { email, code });
}

export async function confirmPasswordReset(baseUrl: string, token: string, newPassword: string) {
  return postJson<{ detail: string }>(baseUrl, `/profiles/reset-password/${encodeURIComponent(token)}/`, { new_password: newPassword });
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
  const formData = await buildBusinessSignupFormData(payload);
  return postMultipartJson<EmailVerificationChallengeResponse>(baseUrl, '/profiles/business-signup/', formData, authToken);
}

export async function createManualBusinessProfile(baseUrl: string, payload: ManualBusinessSignupRequest) {
  const formData = await buildBusinessSignupFormData(payload);
  return postMultipartJson<EmailVerificationChallengeResponse>(baseUrl, '/profiles/manual-business-signup/', formData);
}

export async function createInformalBusinessProfile(baseUrl: string, payload: InformalBusinessSignupRequest) {
  const formData = await buildBusinessSignupFormData(payload);
  return postMultipartJson<EmailVerificationChallengeResponse>(baseUrl, '/profiles/informal-business-signup/', formData);
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
  return postJson<EmailVerificationResendResponse>(baseUrl, '/profiles/resend-verification-code/', payload);
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = API_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchJson<T>(baseUrl: string, path: string): Promise<T> {
  const response = await fetchWithTimeout(buildApiUrl(baseUrl, path), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(buildFriendlyApiFallbackMessage(path, response.status));
  }

  return parseApiJson<T>(response, baseUrl);
}

async function postJson<T>(baseUrl: string, path: string, payload: object): Promise<T> {
  const response = await fetchWithTimeout(buildApiUrl(baseUrl, path), {
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

  return parseApiJson<T>(response, baseUrl);
}

async function postMultipartJson<T>(baseUrl: string, path: string, payload: FormData, authToken?: string): Promise<T> {
  const response = await fetchWithTimeout(buildApiUrl(baseUrl, path), {
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

  return parseApiJson<T>(response, baseUrl);
}

async function deleteAuthedJson<T>(baseUrl: string, path: string, authToken: string): Promise<T> {
  const response = await fetchWithTimeout(buildApiUrl(baseUrl, path), {
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

  return parseApiJson<T>(response, baseUrl);
}

async function fetchAllPaginatedJson<T>(baseUrl: string, path: string, timeoutMs = API_REQUEST_TIMEOUT_MS): Promise<T[]> {
  const items: T[] = [];
  let nextUrl: string | null = buildApiUrl(baseUrl, path);
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
  const apiBase = new URL(normalizedBaseUrl);
  const apiPathPrefix = apiBase.pathname.replace(/\/+$/, '');
  let pageCount = 0;

  while (nextUrl) {
    if (pageCount >= MAX_PAGINATED_API_PAGES) {
      throw new Error('The API returned too many pages of results.');
    }
    pageCount += 1;

    const response = await fetchWithTimeout(
      nextUrl,
      {
        headers: {
          Accept: 'application/json',
        },
      },
      timeoutMs,
    );

    if (!response.ok) {
      throw new Error(buildFriendlyApiFallbackMessage(path, response.status));
    }

    const payload = await parseApiJson<PaginatedResponse<T>>(response, baseUrl);
    items.push(...payload.results);
    if (!payload.next) {
      nextUrl = null;
      continue;
    }

    let parsedNext: URL;
    try {
      parsedNext = new URL(payload.next, nextUrl);
    } catch {
      throw new Error('The API returned an invalid pagination link.');
    }

    if (parsedNext.origin !== apiBase.origin
      || parsedNext.username
      || parsedNext.password
      || (apiPathPrefix && parsedNext.pathname !== apiPathPrefix && !parsedNext.pathname.startsWith(`${apiPathPrefix}/`))) {
      throw new Error('The API returned an invalid pagination link.');
    }

    nextUrl = parsedNext.toString();
  }

  return items;
}

async function fetchPagedJson<T>(baseUrl: string, path: string): Promise<PaginatedResponse<T>> {
  const response = await fetchWithTimeout(buildApiUrl(baseUrl, path), {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(buildFriendlyApiFallbackMessage(path, response.status));
  }

  return parseApiJson<PaginatedResponse<T>>(response, baseUrl);
}

function buildApiUrl(baseUrl: string, path: string) {
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
  if (!normalizedBaseUrl) {
    throw new Error(__DEV__ ? MISSING_DEVELOPMENT_API_BASE_URL_MESSAGE : MISSING_PRODUCTION_API_BASE_URL_MESSAGE);
  }
  return `${normalizedBaseUrl}${path}`;
}

async function parseApiJson<T>(response: Response, baseUrl: string): Promise<T> {
  const payload = await response.json() as T;
  return resolveManagedMediaReferences(payload, baseUrl);
}

async function buildBusinessSignupFormData(payload: BusinessSignupRequest | ManualBusinessSignupRequest | InformalBusinessSignupRequest) {
  const formData = new FormData();
  const { attachments, photo_uploads, ...rest } = payload;

  Object.entries(rest).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    appendMultipartValue(formData, key, value);
  });

  await appendBusinessAttachments(formData, attachments);
  await appendBusinessPhotoUploads(formData, photo_uploads);
  await appendDealAttachmentUploads(formData, payload.deal_overrides);
  return formData;
}

async function appendBusinessAttachments(formData: FormData, attachments?: BusinessAttachmentBuckets) {
  if (!attachments) {
    return;
  }

  for (const [attachmentKind, files] of Object.entries(attachments) as Array<[BusinessAttachmentKind, BusinessAttachmentBuckets[BusinessAttachmentKind]]>) {
    const fieldName = businessAttachmentFieldNames[attachmentKind];
    for (const file of files) {
      await appendLocalFilePart(formData, fieldName, file, 'application/octet-stream');
    }
  }
}

async function appendBusinessPhotoUploads(formData: FormData, photoUploads?: BusinessAttachmentDraft[]) {
  if (!photoUploads?.length) {
    return;
  }

  for (const photoUpload of photoUploads) {
    await appendLocalFilePart(formData, 'profile_photo_uploads', photoUpload, 'image/jpeg');
  }
}

async function appendDealAttachmentUploads(formData: FormData, dealOverrides?: BusinessDealOverride[] | null) {
  if (!dealOverrides?.length) {
    return;
  }

  for (const [index, dealOverride] of dealOverrides.entries()) {
    const attachmentUpload = dealOverride.attachment_upload;
    if (!attachmentUpload?.uri) {
      continue;
    }

    await appendLocalFilePart(formData, `deal_attachment_upload_${index}`, attachmentUpload, 'application/octet-stream');
  }
}

type LocalMultipartUpload = {
  mimeType?: string | null;
  name: string;
  uri: string;
};

async function appendLocalFilePart(formData: FormData, fieldName: string, upload: LocalMultipartUpload, fallbackMimeType: string) {
  const localFile = new File(upload.uri);
  const name = upload.name || localFile.name;
  const type = upload.mimeType || localFile.type || fallbackMimeType;
  const useReactNativeFetch = ['1', 'true'].includes((process.env.EXPO_PUBLIC_USE_RN_FETCH ?? '').trim().toLowerCase());

  if (useReactNativeFetch) {
    if (!localFile.exists || localFile.size <= 0) {
      throw new Error('The selected file is empty or unreadable. Please choose it again.');
    }

    // React Native's native multipart serializer reads local files from `uri`.
    formData.append(fieldName, { uri: upload.uri, name, type } as any);
    return;
  }

  const bytes = await localFile.bytes();
  if (!bytes.byteLength) {
    throw new Error('The selected file is empty or unreadable. Please choose it again.');
  }

  // Expo's fetch multipart encoder consumes a byte-backed part rather than a React Native URI part.
  formData.append(fieldName, { name, type, bytes: async () => bytes } as any);
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
  const nativeMetroHost = NativeModules.DiningDealzMetroHost?.host;
  if (typeof nativeMetroHost === 'string' && isLanHost(nativeMetroHost)) {
    return nativeMetroHost;
  }

  const expoConstants = Constants as typeof Constants & {
    experienceUrl?: string | null;
    expoConfig?: {
      hostUri?: string | null;
    } | null;
    linkingUri?: string | null;
    manifest2?: {
      extra?: {
        expoClient?: {
          hostUri?: string | null;
        } | null;
      } | null;
    } | null;
  };

  const hostSources = [
    NativeModules.SourceCode?.scriptURL,
    expoConstants.expoConfig?.hostUri,
    expoConstants.manifest2?.extra?.expoClient?.hostUri,
    expoConstants.linkingUri,
    expoConstants.experienceUrl,
  ];
  const hostCandidates = hostSources.flatMap((candidate) => [
    extractHostFromExpoUrlParam(candidate),
    extractHostFromUrl(candidate),
    extractHostFromHostUri(candidate),
  ]).filter((host): host is string => Boolean(host));

  const lanHost = hostCandidates.find((host) => isPrivateIpv4Host(host) && !isLoopbackHost(host));
  if (lanHost) {
    return lanHost;
  }

  return null;
}

function extractHostFromUrl(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.match(/^https?:\/\/([^/:]+)/i);
  return match ? match[1] : null;
}

function extractHostFromHostUri(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const withoutProtocol = trimmed.replace(/^[a-z]+:\/\//i, '');
  const host = withoutProtocol.split(/[/:]/, 1)[0];
  return host || null;
}

function extractHostFromExpoUrlParam(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const match = value.match(/[?&]url=([^&]+)/i);
  if (!match) {
    return null;
  }

  try {
    return extractHostFromUrl(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}

function isLoopbackHost(host: string) {
  return host === 'localhost' || host === '127.0.0.1';
}

function isPrivateIpv4Host(host: string) {
  return isLanHost(host) || isLoopbackHost(host);
}

function isLanHost(host: string) {
  return /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}

function isLocalDevelopmentApiBaseUrl(value: string) {
  const normalized = normalizeApiBaseUrl(value);
  const host = extractHostFromUrl(normalized);
  if (!host) {
    return false;
  }

  return isPrivateIpv4Host(host);
}

async function fetchAuthedJson<T>(baseUrl: string, path: string, authToken: string): Promise<T> {
  const response = await fetchWithTimeout(buildApiUrl(baseUrl, path), {
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

  return parseApiJson<T>(response, baseUrl);
}

async function postAuthedJson<T>(baseUrl: string, path: string, authToken: string, payload: object): Promise<T> {
  const response = await fetchWithTimeout(buildApiUrl(baseUrl, path), {
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

  return parseApiJson<T>(response, baseUrl);
}

async function postAuthedMultipartJson<T>(baseUrl: string, path: string, authToken: string, payload: FormData): Promise<T> {
  const response = await fetchWithTimeout(buildApiUrl(baseUrl, path), {
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

  return parseApiJson<T>(response, baseUrl);
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
    if (status >= 500) {
      return 'We could not send the verification email, so no business claim was submitted. Try again in a moment.';
    }

    return 'We could not finish creating this business account. Check the highlighted fields and try again.';
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

export async function fetchCustomerPreferences(baseUrl: string, authToken: string, includeAllBusinesses = false) {
  const query = includeAllBusinesses ? '?portal=customer&include_all_businesses=true' : '?portal=customer';
  return fetchAuthedJson<SignupResponse>(baseUrl, `/profiles/preferences/${query}`, authToken);
}

export async function saveCustomerPreferences(baseUrl: string, authToken: string, payload: CustomerPreferencesRequest) {
  return postAuthedJson<SignupResponse>(baseUrl, '/profiles/preferences/', authToken, {
    ...payload,
    portal: 'customer',
  });
}
