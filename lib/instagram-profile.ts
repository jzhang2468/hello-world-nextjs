export const INSTAGRAM_USERNAME_KEY = "furframe_instagram_username";

const profileLink = /^(?:https:\/\/)?(?:www\.)?instagram\.com\/([a-z0-9._]+)\/?(?:[?#][^\s]*)?$/i;
const reservedPaths = new Set([
  "_u", "about", "accounts", "api", "challenge", "create", "developer", "developers", "direct",
  "directory", "download", "emails", "explore", "graphql", "legal", "oauth", "p", "press",
  "privacy", "push", "reel", "reels", "share", "sharing", "static", "stories",
  "terms", "tv", "web", "your_activity", "instagram.com", "www.instagram.com",
]);

export function normalizeInstagramUsername(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  const handle = profileLink.exec(value)?.[1] ?? value.replace(/^@/, "");
  if (!/^[a-z0-9_](?:[a-z0-9._]{0,28}[a-z0-9_])?$/i.test(handle) || handle.includes("..")) return null;
  const username = handle.toLowerCase();
  return reservedPaths.has(username) ? null : username;
}

export function instagramProfileUrl(username: string): string {
  const normalized = normalizeInstagramUsername(username);
  if (!normalized) throw new Error("Invalid Instagram username.");
  return `https://www.instagram.com/${normalized}/`;
}

export function getInstagramUsername(metadata: Record<string, unknown> | null | undefined): string | null {
  return normalizeInstagramUsername(metadata?.[INSTAGRAM_USERNAME_KEY]);
}
