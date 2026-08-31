import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { scrubAuthToken, sessionCookieOptions } from "@/lib/server-session";
import { verifyTurnstileToken } from "@/lib/turnstile";
import type { AccountPortal } from "@/lib/types";

type LoginRequestBody = {
  portal?: AccountPortal;
  identifier?: string;
  password?: string;
  turnstileToken?: string;
};

const MAX_REQUEST_BYTES = 64 * 1024;

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ detail: "Request body is too large." }, { status: 413 });
  }

  const body = (await request.json().catch(() => null)) as LoginRequestBody | null;
  if (!body) {
    return NextResponse.json({ detail: "Invalid request body." }, { status: 400 });
  }

  const portal = body.portal;
  const identifier = body.identifier?.trim() ?? "";
  const password = body.password ?? "";
  const turnstileToken = body.turnstileToken?.trim() ?? "";

  if ((portal !== "customer" && portal !== "business") || !identifier || !password) {
    return NextResponse.json({ detail: "Portal, identifier, and password are required." }, { status: 400 });
  }
  if (identifier.length > 150 || password.length > 1024 || turnstileToken.length > 4096) {
    return NextResponse.json({ detail: "One or more sign-in fields are too long." }, { status: 400 });
  }

  const remoteIp = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const verification = await verifyTurnstileToken(turnstileToken, remoteIp);
  if (!verification.success) {
    return NextResponse.json({ detail: verification.message }, { status: 400 });
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(`${getApiBaseUrl()}/profiles/login/`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ portal, identifier, password }),
      cache: "no-store",
    }, 10_000);
  } catch {
    return NextResponse.json({ detail: "The sign-in service is temporarily unavailable." }, { status: 503 });
  }

  const responseBody = await response.text();
  const sanitized = scrubAuthToken(responseBody);
  const nextResponse = new NextResponse(sanitized.body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-store",
    },
  });

  if (response.ok) {
    if (sanitized.token) {
      nextResponse.cookies.set({
        ...sessionCookieOptions(),
        value: sanitized.token,
      });
    } else {
      nextResponse.cookies.set(sessionCookieOptions(0));
    }
  }

  return nextResponse;
}
