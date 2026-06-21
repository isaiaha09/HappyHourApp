import Image from "next/image";
import Link from "next/link";

import { LoginForm } from "@/components/login-form";
import { getTurnstileSiteKey } from "@/lib/turnstile";

const featureCards = [
  {
    title: "Finding Spots",
    body: "DiningDealz helps people discover places to eat, save money, and move fast between real local deals.",
  },
  {
    title: "Account Management",
    body: "Manage your customer or business details on the mobile app. Manage your billing on the website if you have a business account.",
  },
  {
    title: "Community Focused",
    body: "The businesses and location the app uses is exclusive to the cities of Ventura County, specifically Ventura, Oxnard, and Camarillo, CA. We want to support the local food scene and the communities that make it great.",
  },
];

export default function Home() {
  const turnstileSiteKey = getTurnstileSiteKey();

  return (
    <main className="dd-site-shell relative overflow-hidden px-6 py-8 lg:px-10 lg:py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(255,185,0,0.12),transparent_28%),radial-gradient(circle_at_80%_12%,rgba(255,72,40,0.18),transparent_24%),radial-gradient(circle_at_50%_85%,rgba(255,255,255,0.06),transparent_22%)]" />
      <section className="relative flex min-h-[calc(100vh-4rem)] flex-col gap-10 lg:min-h-[calc(100vh-5rem)]">
          <header className="grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
              <div className="flex items-center gap-5 text-left">
                <Image src="/DiningDealz-Icon.png" alt="DiningDealz icon" width={76} height={76} className="rounded-[22px] shadow-[0_0_40px_rgba(255,72,30,0.45)]" priority />
                <div>
                  <p className="dd-kicker text-left text-xl sm:text-2xl lg:text-3xl">DiningDealz</p>
                </div>
              </div>

              <p className="mx-auto max-w-4xl text-center text-xl font-semibold tracking-[0.08em] text-[#ffd7a6] sm:text-2xl lg:text-3xl">
                Discover. Eat. Save.
              </p>

            <div className="flex flex-wrap justify-center gap-3 lg:justify-end">
              <Link href="/login" className="dd-button-secondary">Login</Link>
              <Link href="/dashboard" className="dd-button-primary">Open dashboard</Link>
            </div>
          </header>

          <div className="mx-auto grid w-full max-w-8xl gap-0 lg:grid-cols-[1.2fr_1fr] lg:items-start">
            <div className="space-y-8">
              <Image src="/DiningDealz-Logo-Transparent.png" alt="DiningDealz logo" width={720} height={720} className="w-full max-w-[640px]" />
            </div>

            <div className="self-start lg:pt-15">
              <LoginForm compact turnstileSiteKey={turnstileSiteKey} />
            </div>
          </div>

          <div className="mx-auto w-full max-w-10xl space-y-5 text-center">
            <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
              Discover local specials and happy hours, save money, and eat well with DiningDealz.
            </h1>
            <p className="text-base leading-8 text-[#f6d6c5] sm:text-lg">
              For those that are interested in having their business included on the map, download the app on the app store and register for a business account.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {featureCards.map((card) => (
              <article key={card.title} className="rounded-[30px] border border-white/10 bg-black/25 p-6 backdrop-blur-sm">
                <p className="dd-kicker">{card.title}</p>
                <p className="mt-4 text-sm leading-7 text-[#ffe7d8]">{card.body}</p>
              </article>
            ))}
          </div>
      </section>
    </main>
  );
}
