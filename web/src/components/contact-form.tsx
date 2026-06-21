"use client";

import { FormEvent, useState, useTransition } from "react";

import { TurnstileWidget } from "@/components/turnstile-widget";

type ContactFormProps = {
  turnstileSiteKey: string;
};

export function ContactForm({ turnstileSiteKey }: ContactFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage(null);
    if (!turnstileToken) {
      setErrorMessage("Complete the security check before opening the email draft.");
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/contact", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            email,
            subject,
            message,
            turnstileToken,
          }),
        });

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => null)) as { detail?: string } | null;
          throw new Error(errorPayload?.detail || `Request failed with status ${response.status}.`);
        }

        const payload = (await response.json()) as { mailtoUrl: string };
        window.location.href = payload.mailtoUrl;
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to prepare the email draft.");
      } finally {
        setTurnstileResetKey((currentValue) => currentValue + 1);
      }
    });
  }

  return (
    <form className="dd-panel gap-5 p-6 sm:p-8" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <p className="dd-kicker">Contact Form</p>
        <h2 className="text-2xl font-semibold text-white">Send DiningDealz a message.</h2>
        <p className="text-sm leading-7 text-[#f6d6c5]">This opens your email app with the form contents prefilled, so you can review and send directly.</p>
      </div>

      <label className="space-y-2 text-sm text-[#ffe7d8]">
        <span>Your name</span>
        <input className="dd-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" required />
      </label>

      <label className="space-y-2 text-sm text-[#ffe7d8]">
        <span>Email address</span>
        <input className="dd-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
      </label>

      <label className="space-y-2 text-sm text-[#ffe7d8]">
        <span>Subject</span>
        <input className="dd-input" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="What can we help with?" required />
      </label>

      <label className="space-y-2 text-sm text-[#ffe7d8]">
        <span>Message</span>
        <textarea
          className="dd-input min-h-40 resize-y"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Share the details of your request."
          required
        />
      </label>

      <TurnstileWidget siteKey={turnstileSiteKey} onTokenChange={setTurnstileToken} resetKey={turnstileResetKey} />

      {errorMessage ? <p className="rounded-2xl border border-[#ff6a5f]/40 bg-[#401010]/80 px-4 py-3 text-sm text-[#ffd1cb]">{errorMessage}</p> : null}

      <button type="submit" className="dd-button-primary w-full sm:w-fit" disabled={isPending || !turnstileToken || !turnstileSiteKey}>
        {isPending ? "Preparing..." : "Open Email Draft"}
      </button>
    </form>
  );
}