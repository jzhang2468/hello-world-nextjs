import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import AccountShell, { LockIcon } from "../components/account-shell";
import { getAuthContext } from "@/lib/auth";
import { isProfileComplete } from "@/lib/profile-types";

export const metadata: Metadata = { title: "Sign in · FurFrame Studio" };

const loginErrors: Record<string, string> = {
  "sign-in": "We couldn’t start Google sign-in. Please try again in a moment.",
  callback: "Your sign-in wasn’t completed. Please try signing in again.",
  "sign-out": "We couldn’t sign you out. Please try again.",
};

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.99-4.3 2.99-7.35Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.42l-3.23-2.5c-.89.6-2.03.96-3.38.96-2.61 0-4.83-1.77-5.62-4.15H3.04v2.58A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.38 13.89a6 6 0 0 1 0-3.78V7.53H3.04a10 10 0 0 0 0 8.94l3.34-2.58Z" />
      <path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.82 1.51l2.87-2.87A9.61 9.61 0 0 0 12 2a10 10 0 0 0-8.96 5.53l3.34 2.58C7.17 7.73 9.39 5.96 12 5.96Z" />
    </svg>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ user, profile }, params] = await Promise.all([getAuthContext(), searchParams]);
  if (user) redirect(isProfileComplete(profile) ? "/captions" : "/profile");
  const error = params.error ? loginErrors[params.error] : undefined;

  return (
    <AccountShell current="login">
      <main className="login-main">
        <div className="login-editorial">
          <Image src="/images/pink-vest-walk.jpg" alt="A dog in a pink cotton vest, ready for a walk" fill priority sizes="(max-width: 760px) 100vw, 50vw" />
          <div className="login-image-title"><span className="eyebrow">THE FURFRAME CAPTION CLUB</span><p>Good dogs.<br />Good company.</p></div>
          <span className="login-image-stamp" aria-hidden="true">✳</span>
          <span className="login-image-note">LIFE IS BETTER TOGETHER.</span>
        </div>
        <section className="login-panel" aria-labelledby="login-title">
          <div className="club-label"><LockIcon /> A LITTLE SOMETHING FOR OUR PEOPLE</div>
          <h1 id="login-title">Come on in<span>.</span></h1>
          <p className="account-intro">A place for you, your best friend, and the everyday adventures in between.</p>
          <div className="login-benefits">
            <div><span aria-hidden="true">01</span><p><strong>Make it yours.</strong> Create your profile and add a photo.</p></div>
            <div><span aria-hidden="true">02</span><p><strong>Make your photos even cuter.</strong> Generate captions and vote on your favourites.</p></div>
          </div>
          {error && <p className="form-feedback is-error" role="alert">{error}</p>}
          <form action="/auth/sign-in" method="post">
            <button className="google-button" type="submit"><GoogleIcon /> Continue with Google <span aria-hidden="true">↗</span></button>
          </form>
          <p className="login-fineprint">You’ll return to Caption Club after signing in. New here? Add your name once to get started.</p>
          <Link className="text-link" href="/captions">Back to Caption Club <span aria-hidden="true">→</span></Link>
        </section>
      </main>
    </AccountShell>
  );
}
