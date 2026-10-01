import Link from "next/link";
import type { ReactNode } from "react";
import { getDisplayFont } from "@/lib/site-settings";

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
  current?: "profile" | "members" | "login";
}) {
  const displayFont = await getDisplayFont();

  return (
    <div className="catalogue-shell account-shell" data-display-font={displayFont}>
      <div className="announcement">FOR THE DOGS. AND THEIR PEOPLE. <span>A little place for good company.</span></div>
      <header className="account-header">
        <Link className="wordmark" href="/" aria-label="FurFrame Studio home">FurFrame <span>Studio</span><sup>®</sup></Link>
        <nav aria-label="Main navigation">
          <Link href="/#collection">The collection</Link>
          <Link href="/members" aria-current={current === "members" ? "page" : undefined}>FurFrame Club</Link>
          <Link className="account-nav-link" href={signedIn ? "/profile" : "/login"} aria-current={current === "profile" || current === "login" ? "page" : undefined}>
            {signedIn ? "My profile" : "Sign in"}
          </Link>
          {signedIn && <form action="/auth/sign-out" method="post"><button className="sign-out-button" type="submit">Sign out</button></form>}
        </nav>
      </header>
      {children}
      <footer className="account-footer">
        <p>A little more colour. A little more joy.</p>
        <span>© 2026 FurFrame Studio · Design by Jennifer Zhang</span>
        <Link href="/">Back to the collection <span aria-hidden="true">↗</span></Link>
      </footer>
    </div>
  );
}
