import type { Metadata } from "next";
import AccountShell from "../components/account-shell";
import { requireAuthContext } from "@/lib/auth";
import { isProfileComplete } from "@/lib/profile-types";
import ProfileForm from "./profile-form";

export const metadata: Metadata = { title: "My profile · FurFrame Studio" };

export default async function ProfilePage() {
  const { user, profile, avatarUrl } = await requireAuthContext();
  const complete = isProfileComplete(profile);

  return (
    <AccountShell signedIn current="profile">
      <main className="profile-main">
        <div className="account-page-heading">
          <p className="eyebrow"><span className="tiny-star" aria-hidden="true">✳</span> YOUR LITTLE CORNER OF FURFRAME</p>
          <h1>{complete ? "Hello, good company." : "Make yourself at home."}</h1>
          <p>{complete ? "A familiar name. A friendly face. A profile that’s all you." : "First, tell us your name. Then you’re ready to join the Club."}</p>
        </div>
        <ProfileForm profile={profile} avatarUrl={avatarUrl} email={user.email ?? ""} complete={complete} />
      </main>
    </AccountShell>
  );
}
