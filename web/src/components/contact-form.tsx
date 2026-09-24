"use client";

import { FormEvent, useState, useTransition } from "react";

import { TurnstileWidget } from "@/components/turnstile-widget";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage(null);
    setSuccessMessage(null);
    if (!turnstileToken) {
      setErrorMessage("Complete the security check before sending your message.");
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetchWithTimeout("/api/contact", {
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

        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        setSuccessMessage(payload?.detail || "Your message has been sent to DiningDealz support.");
        setName("");
        setEmail("");
        setSubject("");
        setMessage("");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Unable to send your message right now. Please try again.");
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
        <p className="text-sm leading-7 text-[#f6d6c5]">Submit this form to send your message directly to the DiningDealz support team.</p>
        <p className="text-xs leading-6 text-[#f6d6c5]/80">
          Privacy notice: we use the information you enter to screen abuse and respond to your request. If your email matches an account, the support message may include its username and business details. Do not include passwords or unnecessary sensitive documents. Read the <a className="font-semibold text-[#ffd35a] hover:text-white" href="/privacy">Privacy Policy</a>.
        </p>
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

      {errorMessage ? <p role="alert" className="rounded-2xl border border-[#ff6a5f]/40 bg-[#401010]/80 px-4 py-3 text-sm text-[#ffd1cb]">{errorMessage}</p> : null}
      {successMessage ? <p role="status" className="rounded-2xl border border-[#7fd7a2]/40 bg-[#173423]/80 px-4 py-3 text-sm text-[#d4ffe2]">{successMessage}</p> : null}

      <button type="submit" className="dd-button-primary w-full sm:w-fit" disabled={isPending || !turnstileToken || !turnstileSiteKey}>
        {isPending ? "Submitting..." : "Submit"}
      </button>
    </form>
  );
}
