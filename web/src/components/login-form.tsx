"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { TurnstileWidget } from "@/components/turnstile-widget";
import { loginProfile } from "@/lib/api";
import { saveSession } from "@/lib/session";
import type { AccountPortal } from "@/lib/types";

type LoginFormProps = {
  compact?: boolean;
  turnstileSiteKey: string;
};

// Temporary switch: set to true when website sign-in should be available again.
const LOGIN_CREDENTIALS_ENABLED = false;

export function LoginForm({ compact = false, turnstileSiteKey }: LoginFormProps) {
  const router = useRouter();
  const [portal, setPortal] = useState<AccountPortal>("customer");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    if (!LOGIN_CREDENTIALS_ENABLED) {
      setErrorMessage("Sign-in is temporarily unavailable.");
      return;
    }

    if (!turnstileToken) {
      setErrorMessage("Complete the security check before signing in.");
      return;
    }

    startTransition(async () => {
      try {
        const response = await loginProfile(portal, identifier.trim(), password, turnstileToken);
        saveSession({ portal: response.portal });
        router.push("/dashboard");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to sign in.");
      } finally {
        setTurnstileResetKey((currentValue) => currentValue + 1);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`dd-panel w-full items-center text-center lg:items-stretch lg:text-left ${compact ? "gap-5 p-6" : "gap-6 p-8"}`}
    >
      <div className="flex w-full flex-col gap-2">
        <p className="dd-kicker">Account Access</p>
        <h2 className="text-2xl font-semibold text-white">Sign in to your DiningDealz dashboard</h2>
        <p className="text-sm leading-6 text-[#f6d6c5]">
          {LOGIN_CREDENTIALS_ENABLED
            ? "Business accounts can manage billing and account controls here. Customer accounts can sign in too."
            : "Account sign-in is temporarily unavailable while we update the website."}
        </p>
      </div>

      {LOGIN_CREDENTIALS_ENABLED ? (
        <>
          <div className="grid w-full grid-cols-2 gap-3 rounded-full border border-white/10 bg-black/30 p-1">
            {(["customer", "business"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`rounded-full px-4 py-3 text-sm font-semibold capitalize transition ${portal === option ? "bg-[#ffb100] text-[#210500]" : "text-[#ffe7d8] hover:bg-white/5"}`}
                onClick={() => setPortal(option)}
              >
                {option}
              </button>
            ))}
          </div>

          <label className="flex w-full flex-col gap-2 text-sm text-[#ffe7d8]">
            Username or email
            <input
              className="dd-input text-left"
              autoComplete="username"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>

          <label className="flex w-full flex-col gap-2 text-sm text-[#ffe7d8]">
            Password
            <input
              className="dd-input text-left"
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              required
            />
          </label>

          <TurnstileWidget siteKey={turnstileSiteKey} onTokenChange={setTurnstileToken} resetKey={turnstileResetKey} />

          {errorMessage ? <p className="w-full rounded-2xl border border-[#ff6a5f]/40 bg-[#401010]/80 px-4 py-3 text-sm text-[#ffd1cb]">{errorMessage}</p> : null}

          <button className="dd-button-primary w-full" disabled={isPending || !turnstileToken || !turnstileSiteKey} type="submit">
            {isPending ? "Signing in..." : "Open dashboard"}
          </button>
        </>
      ) : (
        <div className="w-full rounded-2xl border border-[#ffb100]/25 bg-[#2a1105]/60 px-4 py-4 text-sm leading-6 text-[#f6d6c5]">
          <p className="font-semibold text-[#ffd35a]">Sign-in temporarily unavailable</p>
          <p className="mt-1">We&apos;ll restore account access soon.</p>
        </div>
      )}
    </form>
  );
}
