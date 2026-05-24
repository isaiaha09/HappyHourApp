import { NativeModules } from 'react-native';

import type { PaginatedResponse, PlaceDetail, PlaceListItem } from './types';

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

export async function fetchPlaces(baseUrl: string, city: string) {
  const query = city === 'all' ? '' : `?city=${encodeURIComponent(city)}`;
  const payload = await fetchJson<PaginatedResponse<PlaceListItem>>(baseUrl, `/places/${query}`);
  return payload.results;
}

export async function fetchPlaceDetail(baseUrl: string, slug: string) {
  return fetchJson<PlaceDetail>(baseUrl, `/places/${encodeURIComponent(slug)}/`);
}

async function fetchJson<T>(baseUrl: string, path: string): Promise<T> {
  const response = await fetch(`${normalizeApiBaseUrl(baseUrl)}${path}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Backend request failed with status ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

function getMetroHost() {
  const scriptUrl = NativeModules.SourceCode?.scriptURL;
  if (typeof scriptUrl !== 'string') {
    return null;
  }

  const match = scriptUrl.match(/^https?:\/\/([^/:]+)/i);
  return match ? match[1] : null;
}