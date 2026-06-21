import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="dd-site-shell px-6 py-10 lg:px-10 lg:py-14">
      <div className="mx-auto max-w-4xl space-y-8">
        <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-[#ffd35a]">
          <span className="h-2 w-2 rounded-full bg-[#ff5c3c] shadow-[0_0_16px_#ff5c3c]" />
          Back to DiningDealz
        </Link>

        <section className="dd-panel gap-6 p-6 sm:p-8 lg:p-10">
          <div className="space-y-3">
            <p className="dd-kicker">About DiningDealz</p>
            <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">Helping people find better meals for better prices.</h1>
            <p className="text-base leading-8 text-[#f6d6c5]">
              DiningDealz connects hungry customers with nearby restaurants, bars, and cafes offering timely specials, happy hours, and limited-time food deals.
            </p>
          </div>

          <AboutSection
            title="What we do"
            body="We make local deals easier to discover by organizing business listings, hours, offers, and important details in one place so users can quickly decide where to go."
          />
          <AboutSection
            title="Who we support"
            body="DiningDealz is built for both sides of the local food scene: customers looking to save and businesses looking to grow traffic during key service windows."
          />
          <AboutSection
            title="Our focus"
            body="We focus on practical, accurate, and easy-to-use deal discovery experiences that help communities support local businesses while getting more value from every outing."
          />
        </section>
      </div>
    </main>
  );
}

function AboutSection({ title, body }: { title: string; body: string }) {
  return (
    <section className="space-y-2 border-t border-white/10 pt-5 first:border-t-0 first:pt-0">
      <h2 className="text-xl font-semibold text-[#ffe7d8]">{title}</h2>
      <p className="text-sm leading-7 text-[#f6d6c5]">{body}</p>
    </section>
  );
}
