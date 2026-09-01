import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { LoginForm } from "@/components/login-form";
import { getTurnstileSiteKey } from "@/lib/turnstile";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to manage your DiningDealz account and business tools.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginPage() {
  const turnstileSiteKey = getTurnstileSiteKey();

  return (
    <main className="dd-site-shell grid min-h-screen gap-10 overflow-x-hidden px-4 py-8 text-center sm:px-6 sm:py-10 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:py-14 lg:text-left">
      <section className="flex flex-col items-center justify-between gap-10 py-2 lg:items-start lg:py-6">
        <div className="space-y-6">
          <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-[#ffd35a]">
            <span className="h-2 w-2 rounded-full bg-[#ff5c3c] shadow-[0_0_16px_#ff5c3c]" />
            DiningDealz
          </Link>
          <Image src="/DiningDealz-Logo.png" alt="DiningDealz logo" width={520} height={520} className="mx-auto w-full max-w-[440px] lg:mx-0" priority />
          <div className="mx-auto max-w-xl space-y-4 lg:mx-0">
            <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">Desktop access for billing, account controls, and business tools.</h1>
            <p className="text-base leading-8 text-[#f6d6c5]">
              The web dashboard complements the app and gives business accounts a larger workspace for billing and account-management actions.
            </p>
          </div>
        </div>

        <div className="mx-auto grid w-full max-w-xl gap-4 sm:grid-cols-2 lg:mx-0 lg:max-w-none">
          <FeaturePill title="Business billing" detail="Open your billing portal without leaving the desktop workflow." />
          <FeaturePill title="Verification state" detail="Quickly check account status and email verification progress." />
        </div>
      </section>

      <section className="flex w-full items-center justify-center lg:justify-end">
        <LoginForm turnstileSiteKey={turnstileSiteKey} />
      </section>
    </main>
  );
}

function FeaturePill({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-black/25 p-5">
      <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[#ffb100]">{title}</p>
      <p className="mt-3 text-sm leading-6 text-[#ffe7d8]">{detail}</p>
    </div>
  );
}
