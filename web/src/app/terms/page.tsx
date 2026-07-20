import Link from "next/link";

const termsSections = [
  {
    title: "Eligibility and account responsibility",
    body: "Users are responsible for the accuracy of the information they submit and for activity that occurs through their account credentials. Users must use DiningDealz only for lawful purposes and in a way that does not interfere with the service, other users, or participating businesses.",
  },
  {
    title: "Listings, offers, and business content",
    body: "DiningDealz displays business listings, deals, hours, profile information, notifications, and promotional content, but those details can change. DiningDealz does not guarantee uninterrupted availability, accuracy, or redemption of every listing, offer, or feature. Businesses remain responsible for the accuracy of the information they submit and for honoring the offers and public content they publish through the service.",
  },
  {
    title: "Direct messages, uploads, and user content",
    body: "Customers and businesses may use direct messaging only as allowed by the product rules in effect at the time of use. Business accounts may send approved direct-message images, and those images are intended to disappear from the message feed after about 24 hours. Users must not submit unlawful, abusive, infringing, deceptive, or harmful content. By submitting content through DiningDealz, users authorize DiningDealz to host, process, display, transmit, and moderate that content as needed to operate and protect the service.",
  },
  {
    title: "Business claims, verification, and location features",
    body: "Business users must submit accurate claim, contact, and verification information and may only claim or manage businesses they are authorized to represent. DiningDealz may review, request more information about, approve, reject, limit, or remove claims or related content. If a business uses service-area or mobile location features, the business is responsible for sending accurate location updates and for using those features only with proper permission and authority.",
  },
  {
    title: "Notifications, billing, and paid features",
    body: "DiningDealz may send account, support, verification, favorite-business, business-post, or direct-message related notifications. Some business features may be limited to approved or paid accounts. If paid offerings, billing portals, subscriptions, boosted content, or campaign tools are enabled, the pricing, renewal, cancellation, and feature-specific terms presented for that offering will control in addition to these Terms.",
  },
  {
    title: "Suspension, termination, and retained records",
    body: "DiningDealz may suspend, restrict, or terminate access when necessary to protect the service or enforce these Terms. Users may also delete their own accounts through supported product flows. Even after deletion or termination, DiningDealz may retain records reasonably necessary to preserve conversation history for the remaining participant, maintain business records, investigate misuse, enforce agreements, or comply with legal obligations.",
  },
  {
    title: "Disclaimers, liability limits, and changes",
    body: "DiningDealz is provided on an as-available basis to the extent permitted by law. To the fullest extent permitted by law, DiningDealz disclaims warranties not expressly made and is not responsible for indirect, incidental, or consequential losses arising from use of the service, participating businesses, third-party providers, or changing deal availability. DiningDealz may modify, suspend, or retire features or update these Terms as the platform evolves, and continued use after an update takes effect constitutes acceptance of the revised Terms to the extent permitted by law.",
  },
] as const;

export default function TermsPage() {
  return (
    <main className="dd-site-shell px-6 py-10 lg:px-10 lg:py-14">
      <div className="mx-auto max-w-4xl space-y-8">
        <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-[#ffd35a]">
          <span className="h-2 w-2 rounded-full bg-[#ff5c3c] shadow-[0_0_16px_#ff5c3c]" />
          Back to DiningDealz
        </Link>

        <section className="dd-panel gap-6 p-6 sm:p-8 lg:p-10">
          <div className="space-y-3">
            <p className="dd-kicker">Terms of Service &amp; Agreements</p>
            <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">Rules for using DiningDealz services.</h1>
            <p className="text-base leading-8 text-[#f6d6c5]">
              These Terms of Service and Agreements govern use of the DiningDealz app, website, and related services by customers, business users, and other visitors.
            </p>
          </div>

          {termsSections.map((section) => (
            <LegalSection key={section.title} title={section.title} body={section.body} />
          ))}
        </section>
      </div>
    </main>
  );
}

function LegalSection({ title, body }: { title: string; body: string }) {
  return (
    <section className="space-y-2 border-t border-white/10 pt-5 first:border-t-0 first:pt-0">
      <h2 className="text-xl font-semibold text-[#ffe7d8]">{title}</h2>
      <p className="text-sm leading-7 text-[#f6d6c5]">{body}</p>
    </section>
  );
}