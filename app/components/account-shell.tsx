import Link from "next/link";
import type { ReactNode } from "react";
import { getDisplayFont } from "@/lib/site-settings";
import SiteHeader, { type HeaderPage } from "./site-header";

export function ArrowIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14m-7-7 7 7-7 7" />
    </svg>
  );
}

export function LockIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3" />
    </svg>
  );
}

export default async function AccountShell({
  children,
  signedIn = false,
  current,
}: {
  children: ReactNode;
  signedIn?: boolean;
  current?: HeaderPage;
}) {
  const displayFont = await getDisplayFont();

  return (
    <div className="catalogue-shell account-shell" data-display-font={displayFont}>
      <SiteHeader signedIn={signedIn} current={current} />
      {children}
      <footer className="account-footer">
        <p>A little more colour. A little more joy.</p>
        <span>© 2026 FurFrame Studio · Design by Jennifer Zhang</span>
        <Link href="/">Back to the collection <span aria-hidden="true">↗</span></Link>
      </footer>
    </div>
  );
}
