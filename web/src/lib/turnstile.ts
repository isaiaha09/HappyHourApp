import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type TurnstileVerifyResponse = {
  success: boolean;
  "error-codes"?: string[];
};

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const BACKEND_ENV_PATH = path.join(process.cwd(), "..", "backend", ".env");

function readBackendEnvValue(name: string) {
  if (!existsSync(BACKEND_ENV_PATH)) {
    return "";
  }

  const envFile = readFileSync(BACKEND_ENV_PATH, "utf8");
  const match = envFile.match(new RegExp(`^${name}=(.*)$`, "m"));
  if (!match) {
    return "";
  }

  return match[1].trim().replace(/^['\"]|['\"]$/g, "");
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

  const response = await fetch(VERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
    cache: "no-store",
  });

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
