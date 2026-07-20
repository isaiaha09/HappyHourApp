import Link from "next/link";

const privacySections = [
  {
    title: "Information you provide",
    body: "DiningDealz collects the information users submit directly, including account details such as username, email address, password, portal type, and profile edits. Business users may also submit claim and onboarding materials such as contact details, work information, verification summaries, social links, public business profile content, uploaded photos, and supporting documents. Users may also send support messages and direct messages, including business-sent direct message images.",
  },
  {
    title: "Information collected through use of the service",
    body: "DiningDealz creates and stores service data needed to run the platform, including authentication tokens, email verification status, password reset and two-factor authentication state, favorite businesses, business notification history, direct message threads and receipts, business claim status, feed impression and engagement records, sponsored campaign delivery metrics, and push-device registration details. If an approved service-area or mobile business enables live location features, DiningDealz also stores the business location updates sent from that account.",
  },
  {
    title: "Website, device, and technical information",
    body: "The website may process browser and request data needed to secure and operate the service. Web login and contact forms use Cloudflare Turnstile to reduce abuse. The web dashboard stores the signed-in session token in browser localStorage on that device. DiningDealz may also receive technical diagnostics, error reports, IP-related request information, and device or app identifiers from hosting, storage, security, and monitoring providers used to operate the platform.",
  },
  {
    title: "How DiningDealz uses information",
    body: "DiningDealz uses information to create and manage accounts, authenticate sign-ins, send verification and password-reset messages, provide business claim review and account support, operate direct messaging, deliver push notifications, power favorites and feed features, review abuse or misuse, maintain billing-related access where applicable, and improve the reliability and safety of the app and website.",
  },
  {
    title: "How information may be shared",
    body: "DiningDealz does not sell personal information as part of the standard product experience. Information may be shared with service providers that help operate the platform, such as hosting, database, media storage, email delivery, bot-protection, error-monitoring, mapping, and push-notification providers. Information may also be disclosed when reasonably necessary to enforce the service rules, protect users or businesses, respond to legal requests, or address fraud, security, or safety issues.",
  },
  {
    title: "Retention, deletion, and direct-message records",
    body: "DiningDealz keeps information for as long as reasonably needed to operate the service, support business records, resolve disputes, enforce policies, and meet legal obligations. If an account is deleted, certain information may be removed or anonymized, but some records may be retained to preserve service integrity. For example, direct message threads and receipts may remain available in read-only form for the other participant after one account is deleted. Business direct-message images are designed to disappear from the conversation feed after about 24 hours and may be deleted from storage after they expire.",
  },
  {
    title: "Your choices and contact options",
    body: "Users can update certain profile details from the product interface, manage direct-messaging settings where available, control device permissions such as notifications or business location access through the device or app settings, and request account deletion from inside the app. Users can also contact DiningDealz support for account, privacy, or policy questions.",
  },
] as const;

export default function PrivacyPage() {
  return (
    <main className="dd-site-shell px-6 py-10 lg:px-10 lg:py-14">
      <div className="mx-auto max-w-4xl space-y-8">
        <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-[#ffd35a]">
          <span className="h-2 w-2 rounded-full bg-[#ff5c3c] shadow-[0_0_16px_#ff5c3c]" />
          Back to DiningDealz
        </Link>

        <section className="dd-panel gap-6 p-6 sm:p-8 lg:p-10">
          <div className="space-y-3">
            <p className="dd-kicker">Privacy Policy</p>
            <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">How DiningDealz collects and uses information.</h1>
            <p className="text-base leading-8 text-[#f6d6c5]">
              This Privacy Policy explains what information DiningDealz collects, how that information is used, when it may be shared, and what choices users have when using the DiningDealz app, website, and related services.
            </p>
          </div>

          {privacySections.map((section) => (
            <PrivacySection key={section.title} title={section.title} body={section.body} />
          ))}
        </section>
      </div>
    </main>
  );
}

function PrivacySection({ title, body }: { title: string; body: string }) {
  return (
    <section className="space-y-2 border-t border-white/10 pt-5 first:border-t-0 first:pt-0">
      <h2 className="text-xl font-semibold text-[#ffe7d8]">{title}</h2>
      <p className="text-sm leading-7 text-[#f6d6c5]">{body}</p>
    </section>
  );
}