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

    if (!turnstileToken) {
      setErrorMessage("Complete the security check before signing in.");
      return;
    }

    startTransition(async () => {
      try {
        const response = await loginProfile(portal, identifier.trim(), password, turnstileToken);
        saveSession({ authToken: response.auth_token, portal: response.portal });
        router.push("/dashboard");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to sign in.");
      } finally {
        setTurnstileResetKey((currentValue) => currentValue + 1);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className={`dd-panel ${compact ? "gap-5 p-6" : "gap-6 p-8"}`}>
      <div className="flex flex-col gap-2">
        <p className="dd-kicker">Account Access</p>
        <h2 className="text-2xl font-semibold text-white">Sign in to your DiningDealz dashboard</h2>
        <p className="text-sm leading-6 text-[#f6d6c5]">
          Business accounts can manage billing and account controls here. Customer accounts can sign in too.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-full border border-white/10 bg-black/30 p-1">
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

      <label className="flex flex-col gap-2 text-sm text-[#ffe7d8]">
        Username or email
        <input
          className="dd-input"
          autoComplete="username"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          placeholder="you@example.com"
          required
        />
      </label>

      <label className="flex flex-col gap-2 text-sm text-[#ffe7d8]">
        Password
        <input
          className="dd-input"
          autoComplete="current-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter your password"
          required
        />
      </label>

      <TurnstileWidget siteKey={turnstileSiteKey} onTokenChange={setTurnstileToken} resetKey={turnstileResetKey} />

      {errorMessage ? <p className="rounded-2xl border border-[#ff6a5f]/40 bg-[#401010]/80 px-4 py-3 text-sm text-[#ffd1cb]">{errorMessage}</p> : null}

      <button className="dd-button-primary" disabled={isPending || !turnstileToken || !turnstileSiteKey} type="submit">
        {isPending ? "Signing in..." : "Open dashboard"}
      </button>
    </form>
  );
}