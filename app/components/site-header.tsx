"use client";

import Link from "next/link";
import { useRef, useState } from "react";

export type HeaderPage = "collection" | "captions" | "profile" | "login";

export default function SiteHeader({ signedIn = false, current, onCollectionNavigate }: {
  signedIn?: boolean;
  current?: HeaderPage;
  onCollectionNavigate?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <div className="announcement">FOR THE DOGS. AND THEIR PEOPLE. <span>Everyday essentials, a little less ordinary.</span></div>
      <header className="site-header">
        <button ref={menuButton} className="icon-button mobile-menu" type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="main-navigation" onClick={() => setMenuOpen(!menuOpen)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d={menuOpen ? "m6 6 12 12M18 6 6 18" : "M4 7h16M4 12h16M4 17h16"} /></svg>
        </button>
        <nav id="main-navigation" className={menuOpen ? "header-nav open" : "header-nav"} aria-label="Main navigation" onKeyDown={(event) => { if (event.key === "Escape") { closeMenu(); menuButton.current?.focus(); } }}>
          <Link href="/#collection" aria-current={current === "collection" ? "page" : undefined} onClick={() => { onCollectionNavigate?.(); closeMenu(); }}>The collection</Link>
          <Link href="/captions" aria-current={current === "captions" ? "page" : undefined} onClick={closeMenu}>Caption Club</Link>
          {signedIn && <form className="mobile-sign-out" action="/auth/sign-out" method="post"><button className="sign-out-button" type="submit">Sign out</button></form>}
        </nav>
        <Link className="wordmark" href="/" aria-label="FurFrame Studio home" onClick={closeMenu}>FurFrame <span>Studio</span><sup>®</sup></Link>
        <div className="catalogue-account-actions">
          <Link className="catalogue-profile-link" href={signedIn ? "/profile" : "/login"} aria-label={signedIn ? "My profile" : "Sign in"} aria-current={current === "profile" || current === "login" ? "page" : undefined} onClick={closeMenu}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>
            <span>{signedIn ? "My profile" : "Sign in"}</span>
          </Link>
          {signedIn && <form className="desktop-sign-out" action="/auth/sign-out" method="post"><button className="sign-out-button" type="submit">Sign out</button></form>}
        </div>
      </header>
    </>
  );
}
