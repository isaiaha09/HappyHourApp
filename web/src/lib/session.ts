import type { StoredSession } from "./types";

const SESSION_KEY = "diningdealz-web-session:v2";
const LEGACY_SESSION_KEYS = ["diningdealz-web-session:v1", "diningdealz-web-session"];

function isStoredSession(value: unknown): value is StoredSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<StoredSession>;
  return candidate.portal === "customer" || candidate.portal === "business";
}

export function saveSession(session: StoredSession) {
  if (typeof window === "undefined") {
    return;
  }

  if (!isStoredSession(session)) {
    return;
  }

  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ version: 2, portal: session.portal }));
  } catch {
    // Storage can be disabled or full; the in-memory session remains usable.
  }
}

export function readSession(): StoredSession | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const sessionKeys = [SESSION_KEY, ...LEGACY_SESSION_KEYS];
    for (const key of sessionKeys) {
      const rawValue = window.localStorage.getItem(key);
      if (!rawValue) {
        continue;
      }

      const parsedValue = JSON.parse(rawValue) as { version?: unknown; authToken?: unknown } & Partial<StoredSession>;
      if (!isStoredSession(parsedValue)) {
        continue;
      }

      // Rewrite the record even when it looks current so unexpected legacy token fields are removed.
      window.localStorage.removeItem(SESSION_KEY);
      saveSession({ portal: parsedValue.portal });
      for (const legacyKey of LEGACY_SESSION_KEYS) {
        window.localStorage.removeItem(legacyKey);
      }
      return { portal: parsedValue.portal };
    }
    window.localStorage.removeItem(SESSION_KEY);
    for (const legacyKey of LEGACY_SESSION_KEYS) {
      window.localStorage.removeItem(legacyKey);
    }
    return null;
  } catch {
    try {
      window.localStorage.removeItem(SESSION_KEY);
      for (const legacyKey of LEGACY_SESSION_KEYS) {
        window.localStorage.removeItem(legacyKey);
      }
    } catch {
      // Ignore storage cleanup failures.
    }
    return null;
  }
}

export function clearSession() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(SESSION_KEY);
    for (const legacyKey of LEGACY_SESSION_KEYS) {
      window.localStorage.removeItem(legacyKey);
    }
  } catch {
    // Ignore storage cleanup failures.
  }
}
