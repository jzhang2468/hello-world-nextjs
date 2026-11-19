"use server";

import { revalidatePath } from "next/cache";
import { getInstagramUsername, INSTAGRAM_USERNAME_KEY, normalizeInstagramUsername } from "@/lib/instagram-profile";
import { createClient } from "@/lib/supabase/server";

export async function saveInstagramProfile(input: string): Promise<{ username?: string; error?: string }> {
  const username = normalizeInstagramUsername(input);
  if (!username) return { error: "Enter your Instagram @username or a link to your Instagram profile." };

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) return { error: "Sign in to save your Instagram profile." };

    // Supabase merges these keys into the current member's editable metadata.
    const { data, error } = await supabase.auth.updateUser({ data: { [INSTAGRAM_USERNAME_KEY]: username } });
    if (error || data.user?.id !== user.id || getInstagramUsername(data.user.user_metadata) !== username) {
      return { error: "Couldn’t save your Instagram profile. Please try again." };
    }
    revalidatePath("/profile");
    revalidatePath("/captions");
    return { username };
  } catch {
    return { error: "Couldn’t save your Instagram profile. Please try again." };
  }
}
