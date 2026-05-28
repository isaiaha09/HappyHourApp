import Image from "next/image";
import Link from "next/link";

import { DashboardShell } from "@/components/dashboard-shell";

export default function DashboardPage() {
  return (
    <main className="dd-site-shell px-6 py-10 lg:px-10 lg:py-14">
      <header className="mb-8 flex flex-col gap-5 rounded-[32px] border border-white/10 bg-black/30 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <Image src="/DiningDealz-Icon.png" alt="DiningDealz icon" width={68} height={68} className="rounded-[20px] shadow-[0_0_35px_rgba(255,72,30,0.35)]" />
          <div>
            <p className="dd-kicker">DiningDealz Dashboard</p>
            <h1 className="text-2xl font-semibold text-white">Web account center</h1>
          </div>
        </div>

        <Link href="/" className="dd-button-secondary text-center">
          Back to landing page
        </Link>
      </header>

      <DashboardShell />
    </main>
  );
}