import Link from "next/link";

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
              These terms describe the baseline expectations for customers, businesses, and visitors using the DiningDealz app, website, and related services.
            </p>
          </div>

          <LegalSection
            title="Use of the platform"
            body="DiningDealz may be used only for lawful purposes and in a way that does not interfere with the service, other users, or participating businesses. Account holders are responsible for activity performed through their account credentials."
          />
          <LegalSection
            title="Business listings and offers"
            body="Business information, offers, hours, and promotional details may change. DiningDealz does not guarantee uninterrupted availability of any specific deal, listing, reservation option, or billing feature. Businesses remain responsible for the accuracy of their submitted information and the fulfillment of their published offers."
          />
          <LegalSection
            title="Accounts and billing"
            body="Some features are available only to verified or subscribed business accounts. If billing features are enabled, recurring charges, renewal timing, cancellation terms, and related account controls will be presented within the applicable billing flow or business dashboard."
          />
          <LegalSection
            title="Changes to the service"
            body="DiningDealz may modify, suspend, or retire features as the platform evolves. Continued use of the service after an update takes effect constitutes acceptance of the revised terms to the extent permitted by law."
          />
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