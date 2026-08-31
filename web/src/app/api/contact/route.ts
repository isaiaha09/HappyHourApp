import { NextRequest, NextResponse } from "next/server";

import { CONTACT_EMAIL } from "@/lib/contact";
import { verifyTurnstileToken } from "@/lib/turnstile";

type ContactRequestBody = {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
  turnstileToken?: string;
};

const MAX_REQUEST_BYTES = 64 * 1024;

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ detail: "Request body is too large." }, { status: 413 });
  }

  const body = (await request.json().catch(() => null)) as ContactRequestBody | null;
  if (!body) {
    return NextResponse.json({ detail: "Invalid request body." }, { status: 400 });
  }

  const name = body.name?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const subject = body.subject?.trim() ?? "";
  const message = body.message?.trim() ?? "";
  const turnstileToken = body.turnstileToken?.trim() ?? "";

  if (!name || !email || !subject || !message) {
    return NextResponse.json({ detail: "All contact fields are required." }, { status: 400 });
  }
  if (name.length > 160 || email.length > 254 || subject.length > 160 || message.length > 4000 || turnstileToken.length > 4096) {
    return NextResponse.json({ detail: "One or more contact fields are too long." }, { status: 400 });
  }

  const remoteIp = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const verification = await verifyTurnstileToken(turnstileToken, remoteIp);
  if (!verification.success) {
    return NextResponse.json({ detail: verification.message }, { status: 400 });
  }

  const bodyText = [`Name: ${name}`, `Email: ${email}`, "", message].join("\n");
  const mailtoUrl = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;

  return NextResponse.json({ mailtoUrl });
}
