import Link from "next/link";

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
              This page outlines the types of information DiningDealz may collect, how that information supports the service, and the controls users have over their data.
            </p>
          </div>

          <PrivacySection
            title="Information we collect"
            body="DiningDealz may collect account details such as usernames, email addresses, profile type, verification state, and business information submitted through signup, claims, contact requests, or dashboard features."
          />
          <PrivacySection
            title="How information is used"
            body="Information is used to operate the app and website, authenticate users, send account-related messages, respond to support requests, improve listings, and support business features such as verification and billing access."
          />
          <PrivacySection
            title="Sharing and disclosure"
            body="DiningDealz does not sell personal information as part of the standard product experience. Information may be shared with service providers that support operations such as hosting, email delivery, analytics, payment processing, or security, but only as needed to run the platform."
          />
          <PrivacySection
            title="Your choices"
            body="Users may contact DiningDealz to request account help, update certain information, or ask privacy-related questions. Where applicable, users may also manage their own account details from the product interface."
          />
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