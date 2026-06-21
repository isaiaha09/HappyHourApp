import { NextRequest, NextResponse } from "next/server";

import { getApiBaseUrl } from "@/lib/api";
import { verifyTurnstileToken } from "@/lib/turnstile";
import type { AccountPortal } from "@/lib/types";

type LoginRequestBody = {
  portal?: AccountPortal;
  identifier?: string;
  password?: string;
  turnstileToken?: string;
};

export async function POST(request: NextRequest) {
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

  const remoteIp = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const verification = await verifyTurnstileToken(turnstileToken, remoteIp);
  if (!verification.success) {
    return NextResponse.json({ detail: verification.message }, { status: 400 });
  }

  const response = await fetch(`${getApiBaseUrl()}/profiles/login/`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ portal, identifier, password }),
    cache: "no-store",
  });

  const responseBody = await response.text();
  return new NextResponse(responseBody, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
