import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { sessionCookieOptions, WEB_SESSION_COOKIE_NAME } from "@/lib/server-session";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(WEB_SESSION_COOKIE_NAME)?.value?.trim() ?? "";
  if (token && token.length <= 256) {
    try {
      await fetchWithTimeout(`${getApiBaseUrl()}/profiles/logout/`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Token ${token}`,
        },
        cache: "no-store",
      }, 5_000);
    } catch {
      // The browser session is cleared even when the backend is unavailable.
    }
  }

  const response = NextResponse.json({ detail: "Signed out." });
  response.cookies.set(sessionCookieOptions(0));
  return response;
}
