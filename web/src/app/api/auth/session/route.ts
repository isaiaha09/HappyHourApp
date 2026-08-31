import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { scrubAuthToken, sessionCookieOptions, WEB_SESSION_COOKIE_NAME } from "@/lib/server-session";
import type { AccountPortal } from "@/lib/types";

export async function GET(request: NextRequest) {
  const token = request.cookies.get(WEB_SESSION_COOKIE_NAME)?.value?.trim() ?? "";
  const portal = request.nextUrl.searchParams.get("portal");
  if (!token || token.length > 256) {
    return NextResponse.json({ detail: "Sign-in required." }, { status: 401 });
  }
  if (portal !== "customer" && portal !== "business") {
    return NextResponse.json({ detail: "A valid account portal is required." }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(`${getApiBaseUrl()}/profiles/me/?portal=${encodeURIComponent(portal as AccountPortal)}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Token ${token}`,
      },
      cache: "no-store",
    }, 10_000);
  } catch {
    return NextResponse.json({ detail: "The dashboard service is temporarily unavailable." }, { status: 503 });
  }

  const sanitized = scrubAuthToken(await response.text());
  const nextResponse = new NextResponse(sanitized.body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });
  if (response.status === 401 || response.status === 403) {
    nextResponse.cookies.set(sessionCookieOptions(0));
  }
  return nextResponse;
}
