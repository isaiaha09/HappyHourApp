import type { AccountPortal, SignupResponse } from "./types";

const FALLBACK_API_BASE_URL = "http://127.0.0.1:8000/api";

export function getApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!configured) {
    return FALLBACK_API_BASE_URL;
  }

  return configured.replace(/\/+$/, "").endsWith("/api")
    ? configured.replace(/\/+$/, "")
    : `${configured.replace(/\/+$/, "")}/api`;
}

export async function loginProfile(
  portal: AccountPortal,
  identifier: string,
  password: string,
) {
  return postJson<SignupResponse>("/profiles/login/", {
    portal,
    identifier,
    password,
  });
}

export async function fetchProfileDashboard(authToken: string, portal: AccountPortal) {
  return fetchAuthedJson<SignupResponse>(`/profiles/me/?portal=${encodeURIComponent(portal)}`, authToken);
}

function buildApiUrl(path: string) {
  return `${getApiBaseUrl()}${path}`;
}

async function postJson<T>(path: string, payload: object): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    throw new Error(flattenApiError(errorPayload) || `Request failed with status ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

async function fetchAuthedJson<T>(path: string, authToken: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    headers: {
      Accept: "application/json",
      Authorization: `Token ${authToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    throw new Error(flattenApiError(errorPayload) || `Request failed with status ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

function flattenApiError(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(flattenApiError).filter(Boolean).join(" ");
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => `${key}: ${flattenApiError(entry)}`)
      .join(" ");
  }

  return typeof value === "string" ? value : "";
}