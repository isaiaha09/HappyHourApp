import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { readJsonBodyLimited } from "@/lib/read-json-body-limited";
type ContactRequestBody = {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
  turnstileToken?: string;
};

const MAX_REQUEST_BYTES = 64 * 1024;
export const maxDuration = 30;

function getErrorDetail(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(getErrorDetail).filter(Boolean).join(" ") || null;
  }

  if (value && typeof value === "object") {
    const payload = value as Record<string, unknown>;
    if (typeof payload.detail === "string") {
      return payload.detail;
    }

    return Object.values(payload).map(getErrorDetail).filter(Boolean).join(" ") || null;
  }

  return null;
}

export async function POST(request: NextRequest) {
  const parsedBody = await readJsonBodyLimited(request, MAX_REQUEST_BYTES);
  if (parsedBody.kind === "too-large") {
    return NextResponse.json({ detail: "Request body is too large." }, { status: 413 });
  }
  if (parsedBody.kind === "invalid") {
    return NextResponse.json({ detail: "Invalid request body." }, { status: 400 });
  }
  const body = parsedBody.value as ContactRequestBody | null;
  if (!body) {
    return NextResponse.json({ detail: "Invalid request body." }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const subject = body.subject?.trim() ?? "";
  const message = body.message?.trim() ?? "";
  const turnstileToken = body.turnstileToken?.trim() ?? "";

  if (!name || !email || !subject || !message || !turnstileToken) {
    return NextResponse.json({ detail: "All contact fields and the security check are required." }, { status: 400 });
  }
  if (name.length > 160 || email.length > 254 || subject.length > 160 || message.length > 4000 || turnstileToken.length > 4096) {
    return NextResponse.json({ detail: "One or more contact fields are too long." }, { status: 400 });
  }

  const clientIpCandidate = request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientIp = clientIpCandidate && clientIpCandidate.length <= 64 && /^[\da-fA-F:.]+$/.test(clientIpCandidate)
    ? clientIpCandidate
    : null;

  let response: Response;
  try {
    const headers = new Headers({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    if (clientIp) {
      headers.set("X-Contact-Client-IP", clientIp);
    }

    response = await fetchWithTimeout(getApiBaseUrl() + "/profiles/website-contact/", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name,
        email,
        subject,
        message,
        turnstile_token: turnstileToken,
      }),
      cache: "no-store",
    }, 28_000);
  } catch {
    return NextResponse.json(
      { detail: "The contact service is temporarily unavailable. Please try again shortly." },
      { status: 503 },
    );
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json(
      { detail: getErrorDetail(payload) || "Unable to send your message right now. Please try again." },
      { status: response.status },
    );
  }

  return NextResponse.json(
    { detail: getErrorDetail(payload) || "Your message has been sent to DiningDealz support." },
    { status: response.status },
  );
}
