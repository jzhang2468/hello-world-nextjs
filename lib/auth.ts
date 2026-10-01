import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { Profile } from "@/lib/profile-types";
import { createClient } from "@/lib/supabase/server";

type AuthContext = {
  user: User | null;
  profile: Profile | null;
  avatarUrl: string | null;
};

// React's cache deduplicates this only within a server render, never across
// visitors. Identity is confirmed by Supabase Auth, not trusted from cookies.
export const getAuthContext = cache(async (): Promise<AuthContext> => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return { user: null, profile: null, avatarUrl: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, avatar_path")
    .eq("id", user.id)
    .maybeSingle<Profile>();

  let avatarUrl: string | null = null;
  if (profile?.avatar_path?.startsWith(`${user.id}/`)) {
    const { data } = await supabase.storage
      .from("avatars")
      .createSignedUrl(profile.avatar_path, 60 * 30);
    avatarUrl = data?.signedUrl ?? null;
  }

  return { user, profile, avatarUrl };
});

export async function requireAuthContext() {
  const context = await getAuthContext();
  if (!context.user) redirect("/login");
  return { ...context, user: context.user };
}
