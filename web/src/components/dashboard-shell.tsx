"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { fetchProfileDashboard } from "@/lib/api";
import { clearSession, readSession } from "@/lib/session";
import type { SignupResponse } from "@/lib/types";

export function DashboardShell() {
  const router = useRouter();
  const [session, setSession] = useState<SignupResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const storedSession = readSession();
    if (!storedSession) {
      setIsLoading(false);
      return;
    }

    void fetchProfileDashboard(storedSession.authToken, storedSession.portal)
      .then((response) => {
        setSession(response);
      })
      .catch((error) => {
        clearSession();
        setErrorMessage(error instanceof Error ? error.message : "Unable to load dashboard.");
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  function handleLogout() {
    startTransition(() => {
      clearSession();
      router.push("/login");
      router.refresh();
    });
  }

  if (isLoading) {
    return <div className="dd-panel p-8 text-[#ffe7d8]">Loading your dashboard...</div>;
  }

  if (!session) {
    return (
      <div className="dd-panel flex flex-col gap-5 p-8 text-[#ffe7d8]">
        <div>
          <p className="dd-kicker">Dashboard Access</p>
          <h1 className="text-3xl font-semibold text-white">Sign in required</h1>
        </div>
        <p className="text-sm leading-6 text-[#f6d6c5]">
          {errorMessage ?? "You need to sign in before you can access the web dashboard."}
        </p>
        <Link href="/login" className="dd-button-primary text-center">
          Go to login
        </Link>
      </div>
    );
  }

  const fullName = [session.first_name, session.last_name].filter(Boolean).join(" ") || session.username;

  return (
    <div className="flex flex-col gap-8">
      <section className="dd-panel p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <p className="dd-kicker">Welcome back</p>
            <div>
              <h1 className="text-3xl font-semibold text-white">{fullName}</h1>
              <p className="mt-2 text-sm leading-6 text-[#f6d6c5]">
                {session.profile_type === "business"
                  ? "Manage your business account, billing, and claim status from the desktop dashboard."
                  : "Review your account details and verification status from the web dashboard."}
              </p>
            </div>
          </div>

          <button type="button" onClick={handleLogout} className="dd-button-secondary" disabled={isPending}>
            {isPending ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <div className="dd-panel p-8">
          <p className="dd-kicker">Account Overview</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <DashboardStat label="Portal" value={capitalize(session.portal)} />
            <DashboardStat label="Profile type" value={capitalize(session.profile_type)} />
            <DashboardStat label="Email" value={session.email} />
            <DashboardStat label="Email status" value={session.email_verified ? "Verified" : "Pending verification"} />
            <DashboardStat label="2FA preference" value={session.two_factor_enabled ? "Enabled" : "Disabled"} />
            <DashboardStat label="Business status" value={session.business_status ? capitalize(session.business_status.replaceAll("_", " ")) : "Not applicable"} />
          </div>
        </div>

        <div className="dd-panel p-8">
          <p className="dd-kicker">Business Tools</p>
          <div className="mt-5 space-y-4 text-sm leading-6 text-[#f6d6c5]">
            <p>
              The web dashboard is where business accounts can access billing and account-management tasks that do not need to live inside the mobile app.
            </p>
            {session.billing_portal_url ? (
              <a href={session.billing_portal_url} target="_blank" rel="noreferrer" className="dd-button-primary block text-center">
                Open billing portal
              </a>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-[#f8dfd2]">
                Billing access will appear here for approved business accounts.
              </div>
            )}
          </div>
        </div>
      </section>

      {session.approved_businesses?.length ? (
        <section className="dd-panel p-8">
          <p className="dd-kicker">Approved Businesses</p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {session.approved_businesses.map((business) => (
              <article key={business.id} className="rounded-[28px] border border-white/10 bg-black/20 p-5">
                <h2 className="text-lg font-semibold text-white">{business.name}</h2>
                <p className="mt-2 text-sm text-[#f6d6c5]">{business.city_label} • {business.venue_type_label}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function DashboardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffb100]">{label}</p>
      <p className="mt-3 text-sm leading-6 text-white">{value}</p>
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}