import Link from "next/link";

export function SiteFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-white/8 bg-black/25 px-6 py-5 backdrop-blur-sm lg:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col items-center gap-3 lg:items-end">
          <p className="dd-kicker text-center lg:text-right">Quick Links</p>
          <nav className="flex flex-col items-center gap-2 text-sm font-medium text-[#ffe7d8] lg:items-end">
            <Link href="/contact" className="hover:text-[#ffd35a]">
              Contact Us
            </Link>
            <Link href="/terms" className="hover:text-[#ffd35a]">
              Terms of Service &amp; Agreements
            </Link>
            <Link href="/privacy" className="hover:text-[#ffd35a]">
              Privacy Policy
            </Link>
          </nav>
        </div>

        <div className="text-center text-sm text-[#f6d6c5]">
          <span>
            Copyright <span className="text-base text-[#ffd35a]">©</span> {currentYear} DiningDealz - All Rights Reserved
          </span>
        </div>
      </div>
    </footer>
  );
}