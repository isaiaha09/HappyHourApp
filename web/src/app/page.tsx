import Image from "next/image";
import Link from "next/link";

import { LoginForm } from "@/components/login-form";

const featureCards = [
  {
    title: "Find the app",
    body: "DiningDealz helps people discover places to eat, save money, and move fast between real local deals.",
  },
  {
    title: "Manage business accounts",
    body: "The web dashboard gives business users a cleaner space for billing and account tools than a phone screen can.",
  },
  {
    title: "Keep the experience unified",
    body: "The website and app share the same account system, verification flow, and brand direction.",
  },
];

export default function Home() {
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

          <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
            <div className="space-y-8">
              <Image src="/DiningDealz-Logo-Transparent.png" alt="DiningDealz logo" width={720} height={720} className="w-full max-w-[640px]" />
              <div className="max-w-2xl space-y-5">
                <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
                  A sharper web front door for the DiningDealz app.
                </h1>
                <p className="text-base leading-8 text-[#f6d6c5] sm:text-lg">
                  This site introduces the app, gives users a clear login path, and gives business accounts access to desktop-first account tools like billing.
                </p>
              </div>
            </div>

            <div className="self-start lg:pt-2">
              <LoginForm compact />
            </div>
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
