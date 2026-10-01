import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import AccountShell, { ArrowIcon, LockIcon } from "../components/account-shell";
import { requireAuthContext } from "@/lib/auth";
import { isProfileComplete } from "@/lib/profile-types";

export const metadata: Metadata = { title: "FurFrame Club · FurFrame Studio" };

export default async function MembersPage() {
  const { profile, avatarUrl } = await requireAuthContext();
  if (!isProfileComplete(profile)) redirect("/profile");

  return (
    <AccountShell signedIn current="members">
      <main className="members-main">
        <section className="club-welcome" aria-labelledby="club-title">
          <div className="club-welcome-copy">
            <p className="club-label"><LockIcon /> MEMBERS ONLY · FURFRAME CLUB</p>
            <h1 id="club-title">Good company<br />starts with you<span>.</span></h1>
            <p>Welcome, {profile.first_name}. Here’s to the little routines, the long walks, and the very good dogs who make them better.</p>
            <Link className="member-profile-chip" href="/profile"><span className="member-avatar">{avatarUrl ? <Image src={avatarUrl} alt="" fill unoptimized sizes="36px" /> : <span>{profile.first_name?.charAt(0)}{profile.last_name?.charAt(0)}</span>}</span><span>{profile.first_name} {profile.last_name}<small>View your profile</small></span><span aria-hidden="true">↗</span></Link>
          </div>
          <div className="club-welcome-photo"><Image src="/images/community-dogs.jpg" alt="Dogs enjoying some good company" fill priority sizes="(max-width: 760px) 100vw, 42vw" /><div className="club-photo-tag">THE GOOD COMPANY CLUB <span aria-hidden="true">✳</span></div></div>
        </section>
        <section className="club-journal" aria-labelledby="club-journal-title">
          <div className="club-section-heading"><div><p className="eyebrow">A FEW NOTES FROM THE STUDIO</p><h2 id="club-journal-title">For the everyday adventures.</h2></div><span className="club-edition">CLUB NOTES / 01</span></div>
          <div className="club-notes-grid">
            <article className="club-note"><span className="club-note-number">01 / THE SLOW WALK</span><span className="club-note-symbol" aria-hidden="true">↗</span><h3>Take the scenic route.</h3><p>Leave a little room for the detour. A familiar street, a new corner, a few extra minutes together. Some of the best walks have no destination.</p></article>
            <article className="club-note"><span className="club-note-number">02 / THE LITTLE DETAILS</span><span className="club-note-symbol" aria-hidden="true">✳</span><h3>A colour for your character.</h3><p>Soft pink for the daydreamer. Fresh green for the explorer. A little blue for the easy-going one. Let their everyday essentials have a little personality.</p></article>
            <article className="club-note"><span className="club-note-number">03 / A MOMENT TO KEEP</span><span className="club-note-symbol" aria-hidden="true">♡</span><h3>Find the ordinary magic.</h3><p>The muddy paws. The head tilt. The pause by the door. Take a photo of one small moment from your next walk. Those are the ones worth keeping.</p></article>
          </div>
        </section>
        <div className="club-collection-banner"><div><span className="eyebrow">READY WHEN YOU ARE</span><h2>A little colour for your next walk.</h2></div><Link className="black-button" href="/#collection">Explore the collection <ArrowIcon /></Link></div>
      </main>
    </AccountShell>
  );
}
