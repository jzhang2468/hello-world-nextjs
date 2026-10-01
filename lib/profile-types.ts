export type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_path: string | null;
};

export type ProfileFormState = {
  error?: string;
  success?: string;
};

export function isProfileComplete(
  profile: Profile | null,
): profile is Profile & { first_name: string; last_name: string } {
  return Boolean(profile?.first_name?.trim() && profile.last_name?.trim());
}

export const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
export const MAX_NAME_LENGTH = 80;
