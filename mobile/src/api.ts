import { NativeModules } from 'react-native';

import type {
  BusinessSignupRequest,
  CustomerSignupRequest,
  LoginRequest,
  ManualBusinessSignupRequest,
  PaginatedResponse,
  PlaceDetail,
  PlaceListItem,
  SignupResponse,
} from './types';

const FALLBACK_API_BASE_URL = 'http://127.0.0.1:8000/api';

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

export async function createCustomerProfile(baseUrl: string, payload: CustomerSignupRequest) {
  return postJson<SignupResponse>(baseUrl, '/profiles/customer-signup/', payload);
}

export async function loginProfile(baseUrl: string, payload: LoginRequest) {
  return postJson<SignupResponse>(baseUrl, '/profiles/login/', payload);
}

export async function fetchProfileDashboard(baseUrl: string, authToken: string, portal?: 'customer' | 'business') {
  const query = portal ? `?portal=${encodeURIComponent(portal)}` : '';
  return fetchAuthedJson<SignupResponse>(baseUrl, `/profiles/me/${query}`, authToken);
}

export async function resendVerificationEmail(baseUrl: string, authToken: string) {
  return postAuthedJson<{ detail: string }>(baseUrl, '/profiles/resend-verification/', authToken, {});
}

export async function updateTwoFactorPreference(baseUrl: string, authToken: string, enabled: boolean, portal?: 'customer' | 'business') {
  return postAuthedJson<SignupResponse>(baseUrl, '/profiles/two-factor/', authToken, {
    enabled,
    portal,
  });
}

export async function createBusinessProfile(baseUrl: string, payload: BusinessSignupRequest) {
  return postJson<SignupResponse>(baseUrl, '/profiles/business-signup/', payload);
}

export async function createManualBusinessProfile(baseUrl: string, payload: ManualBusinessSignupRequest) {
  return postJson<SignupResponse>(baseUrl, '/profiles/manual-business-signup/', payload);
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

function buildApiUrl(baseUrl: string, path: string) {
  return `${normalizeApiBaseUrl(baseUrl)}${path}`;
}

function flattenApiError(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => flattenApiError(entry)).join(' ');
  }

  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${key}: ${flattenApiError(entry)}`)
      .join(' ');
  }

  return typeof value === 'string' ? value : 'Unable to complete the request.';
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