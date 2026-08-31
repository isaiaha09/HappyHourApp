import type { AccountPortal, SignupResponse } from "./types";
import { fetchWithTimeout } from "./fetch-with-timeout";

const FALLBACK_API_BASE_URL = "http://127.0.0.1:8000/api";
const INSECURE_API_BASE_URL_MESSAGE = "The configured API base URL must use HTTPS in production.";

export function getApiBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("The production API base URL is not configured.");
    }
    return FALLBACK_API_BASE_URL;
  }

  const trimmed = configured.replace(/\/+$/, "");
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error("The configured API base URL is invalid.");
  }

  if (!parsed.hostname || parsed.username || parsed.password || !["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("The configured API base URL is invalid.");
  }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error(INSECURE_API_BASE_URL_MESSAGE);
  }

  const pathname = parsed.pathname.replace(/\/+$/, "");
  const apiPath = pathname === "/api" || pathname.endsWith("/api") ? pathname : `${pathname}/api`;
  return `${parsed.origin}${apiPath || "/api"}`;
}

export async function loginProfile(
  portal: AccountPortal,
  identifier: string,
  password: string,
  turnstileToken: string,
) {
  return postLocalJson<SignupResponse>("/api/auth/login", {
    portal,
    identifier,
    password,
    turnstileToken,
  });
}

export async function fetchProfileDashboard(portal: AccountPortal) {
  const response = await fetchWithTimeout(`/api/auth/session?portal=${encodeURIComponent(portal)}`, {
    headers: {
      Accept: "application/json",
    },
    credentials: "same-origin",
    cache: "no-store",
  }, 10_000);

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null);
    throw new Error(flattenApiError(errorPayload) || `Request failed with status ${response.status}.`);
  }

  return response.json() as Promise<SignupResponse>;
}

export async function logoutProfile() {
  await fetchWithTimeout("/api/auth/logout", {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
    credentials: "same-origin",
  }, 5_000).catch(() => undefined);
}

async function postLocalJson<T>(path: string, payload: object): Promise<T> {
  const response = await fetchWithTimeout(path, {
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
