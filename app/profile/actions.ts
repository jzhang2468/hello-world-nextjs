"use server";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  MAX_AVATAR_BYTES,
  MAX_NAME_LENGTH,
  isProfileComplete,
  type Profile,
  type ProfileFormState,
} from "@/lib/profile-types";

export async function saveProfile(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const firstName = formData.get("first_name");
  const lastName = formData.get("last_name");
  if (
    typeof firstName !== "string" ||
    typeof lastName !== "string" ||
    !firstName.trim() ||
    !lastName.trim()
  ) {
    return { error: "Please add both your first name and last name." };
  }
  if (
    firstName.trim().length > MAX_NAME_LENGTH ||
    lastName.trim().length > MAX_NAME_LENGTH
  ) {
    return { error: `Please keep each name to ${MAX_NAME_LENGTH} characters or fewer.` };
  }

  const avatar = formData.get("avatar");
  if (avatar && !(avatar instanceof File)) {
    return { error: "Please choose an image file." };
  }
  const image = avatar instanceof File && avatar.size > 0 ? avatar : null;
  if (
    image &&
    (image.size > MAX_AVATAR_BYTES ||
      !["image/jpeg", "image/png", "image/webp"].includes(image.type))
  ) {
    return { error: "Choose a JPG, PNG, or WebP photo that is 3 MB or smaller." };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { error: "Your session has expired. Please sign in again before saving." };
  }

  const { data: existing, error: readError } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, avatar_path")
    .eq("id", user.id)
    .single<Profile>();
  if (readError || !existing) {
    return { error: "Your profile is not ready yet. Please refresh and try again." };
  }

  let newAvatarPath: string | null = null;
  if (image) {
    let sanitized: Buffer;
    try {
      const bytes = Buffer.from(await image.arrayBuffer());
      const photo = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "error" });
      const metadata = await photo.metadata();
      if (
        !metadata.format ||
        !["jpeg", "png", "webp"].includes(metadata.format) ||
        (metadata.pages ?? 1) > 1
      ) {
        return { error: "Please upload a still JPG, PNG, or WebP photo." };
      }
      // Decode and re-encode rather than trusting the extension/MIME. This also
      // strips camera location metadata; only an object path goes into SQL.
      sanitized = await photo
        .rotate()
        .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer();
      if (sanitized.length > MAX_AVATAR_BYTES) {
        return { error: "This photo is too large. Please choose a smaller photo." };
      }
    } catch {
      return { error: "We could not read that photo. Please choose a different JPG, PNG, or WebP image." };
    }

    newAvatarPath = `${user.id}/${randomUUID()}.webp`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(newAvatarPath, sanitized, {
        contentType: "image/webp",
        upsert: false,
      });
    if (uploadError) return { error: "Your photo could not be uploaded. Please try again." };
  }

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      ...(newAvatarPath ? { avatar_path: newAvatarPath } : {}),
    })
    .eq("id", user.id)
    .select("id")
    .single();
  if (updateError || !updated) {
    if (newAvatarPath) await supabase.storage.from("avatars").remove([newAvatarPath]);
    return { error: "Your profile could not be saved. Please try again." };
  }

  if (newAvatarPath && existing.avatar_path?.startsWith(`${user.id}/`)) {
    await supabase.storage.from("avatars").remove([existing.avatar_path]);
  }
  revalidatePath("/", "layout");
  if (!isProfileComplete(existing)) redirect("/captions");
  return { success: "Your profile is saved." };
}
