import Image from "next/image";
import Link from "next/link";

import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="dd-site-shell grid min-h-screen gap-10 px-6 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:px-10 lg:py-14">
      <section className="flex flex-col justify-between gap-10 py-2 lg:py-6">
        <div className="space-y-6">
          <Link href="/" className="inline-flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.24em] text-[#ffd35a]">
            <span className="h-2 w-2 rounded-full bg-[#ff5c3c] shadow-[0_0_16px_#ff5c3c]" />
            DiningDealz
          </Link>
          <Image src="/DiningDealz-Logo.png" alt="DiningDealz logo" width={520} height={520} className="w-full max-w-[440px]" priority />
          <div className="max-w-xl space-y-4">
            <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">Desktop access for billing, account controls, and business tools.</h1>
            <p className="text-base leading-8 text-[#f6d6c5]">
              The web dashboard complements the app. Customers can sign in, and business accounts get a larger workspace for billing and account-management actions.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FeaturePill title="Business billing" detail="Open your billing portal without leaving the desktop workflow." />
          <FeaturePill title="Verification state" detail="Quickly check account status and email verification progress." />
        </div>
      </section>

      <section className="flex items-center">
        <LoginForm />
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