import { readFileSync } from "node:fs";
import path from "node:path";

import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type TurnstileVerifyResponse = {
  success: boolean;
  "error-codes"?: string[];
};

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const BACKEND_ENV_PATH = path.join(process.cwd(), "..", "backend", ".env");

function readBackendEnvValues() {
  try {
    const envFile = readFileSync(BACKEND_ENV_PATH, "utf8");
    return Object.fromEntries(
      envFile.split(/\r?\n/).flatMap((line) => {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!match) {
          return [];
        }
        return [[match[1], match[2].replace(/^['"]|['"]$/g, "")]];
      }),
    ) as Record<string, string>;
  } catch {
    return {};
  }
}

const BACKEND_ENV_VALUES = readBackendEnvValues();

function readBackendEnvValue(name: string) {
  return BACKEND_ENV_VALUES[name] ?? "";
}

export function getTurnstileSiteKey() {
  return process.env.CLOUDFLARE_TURNSTILE_SITE_KEY?.trim() || readBackendEnvValue("CLOUDFLARE_TURNSTILE_SITE_KEY");
}

function getTurnstileSecretKey() {
  return process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY?.trim() || readBackendEnvValue("CLOUDFLARE_TURNSTILE_SECRET_KEY");
}

export async function verifyTurnstileToken(token: string, remoteIp?: string | null) {
  const secret = getTurnstileSecretKey();
  if (!secret) {
    return { success: false, message: "Turnstile is not configured." };
  }

  if (!token.trim()) {
    return { success: false, message: "Complete the security check and try again." };
  }

  const payload = new URLSearchParams({
    secret,
    response: token,
  });

  if (remoteIp) {
    payload.set("remoteip", remoteIp);
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload.toString(),
      cache: "no-store",
    });
  } catch {
    return { success: false, message: "Unable to verify the security check right now." };
  }

  if (!response.ok) {
    return { success: false, message: "Unable to verify the security check right now." };
  }

  const data = (await response.json()) as TurnstileVerifyResponse;
  if (data.success) {
    return { success: true, message: null };
  }

  const errorCodes = data["error-codes"] ?? [];
  if (errorCodes.includes("missing-input-response") || errorCodes.includes("invalid-input-response")) {
    return { success: false, message: "Complete the security check and try again." };
  }

  if (errorCodes.includes("timeout-or-duplicate")) {
    return { success: false, message: "The security check expired. Please complete it again." };
  }

  return { success: false, message: "The security check could not be verified." };
}
