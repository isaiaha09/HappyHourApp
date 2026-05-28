import Link from "next/link";

import { ContactForm } from "@/components/contact-form";

export default function ContactPage() {
  return (
    <main className="dd-site-shell px-6 py-10 lg:px-10 lg:py-14">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="space-y-6 lg:pt-6">
          <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-[#ffd35a]">
            <span className="h-2 w-2 rounded-full bg-[#ff5c3c] shadow-[0_0_16px_#ff5c3c]" />
            Back to DiningDealz
          </Link>

          <div className="space-y-4">
            <p className="dd-kicker">Contact Us</p>
            <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">Questions, support requests, and partnership inquiries.</h1>
            <p className="max-w-xl text-base leading-8 text-[#f6d6c5]">
              Use the contact form to prepare an email, or reach out directly if you already know what you need. We will respond from the DiningDealz support team.
            </p>
          </div>

          <div className="dd-panel gap-4 p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#ffb100]">Direct Email</p>
            <a href="mailto:support@diningdealz.com" className="text-xl font-semibold text-[#ffd35a] hover:text-[#ffe7d8]">
              support@diningdealz.com
            </a>
            <p className="text-sm leading-7 text-[#f6d6c5]">Best for account help, billing questions, business onboarding, or general support.</p>
          </div>
        </section>

        <section>
          <ContactForm />
        </section>
      </div>
    </main>
  );
}