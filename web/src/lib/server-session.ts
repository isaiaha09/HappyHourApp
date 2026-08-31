export const WEB_SESSION_COOKIE_NAME = process.env.NODE_ENV === "production"
  ? "__Host-diningdealz-session"
  : "diningdealz-web-session";
export const WEB_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function sessionCookieOptions(maxAge = WEB_SESSION_MAX_AGE_SECONDS) {
  return {
    name: WEB_SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function scrubAuthToken(responseBody: string) {
  try {
    const parsed = JSON.parse(responseBody) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { body: responseBody, token: "" };
    }

    const payload = parsed as Record<string, unknown>;
    const token = typeof payload.auth_token === "string" ? payload.auth_token.trim() : "";
    if (!("auth_token" in payload)) {
      return { body: responseBody, token };
    }

    return {
      body: JSON.stringify({ ...payload, auth_token: "" }),
      token,
    };
  } catch {
    return { body: responseBody, token: "" };
  }
}
