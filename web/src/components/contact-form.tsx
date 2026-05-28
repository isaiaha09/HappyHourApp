"use client";

import { FormEvent, useState } from "react";

const CONTACT_EMAIL = "support@diningdealz.com";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = [`Name: ${name}`, `Email: ${email}`, "", message].join("\n");
    const mailtoUrl = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
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

      <button type="submit" className="dd-button-primary w-full sm:w-fit">
        Open Email Draft
      </button>
    </form>
  );
}