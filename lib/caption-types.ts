export type CaptionTone = "deadpan" | "chaotic" | "wholesome";
export type CaptionFeedMode = "fresh" | "top" | "mine";
export const CAPTION_PAGE_SIZE = 24;
export const MAX_CAPTION_PAGE = 417;

export function isCaptionFrameId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function captionFeedOptions(query: Record<string, string | string[] | undefined>) {
  const mode: CaptionFeedMode = query.view === "mine" || query.view === "top" ? query.view : "fresh";
  const page = typeof query.page === "string" && /^[1-9]\d{0,2}$/.test(query.page)
    ? Math.min(Number(query.page), MAX_CAPTION_PAGE) : 1;
  return { mode, page, frameId: isCaptionFrameId(query.frame) ? query.frame.toLowerCase() : null };
}

export function captionFeedHref(mode: CaptionFeedMode, page = 1): string {
  return `/captions?view=${mode}&page=${page}#caption-gallery`;
}

export function captionFrameHref(id: string): string {
  return `/captions?frame=${encodeURIComponent(id)}#frame-${encodeURIComponent(id)}`;
}

const DAILY_PHOTO_IDEAS: { title: string; idea: string; tone: CaptionTone }[] = [
  { title: "The dorm-room supervisor", idea: "A pet from home, a plush desk companion, or a sleepy study buddy: who is really in charge of your homework?", tone: "deadpan" },
  { title: "Small paws, big city", idea: "On your next NYC walk, find a pet-sized moment with main-character energy. Ask before photographing someone else’s animal.", tone: "chaotic" },
  { title: "A little homesick, a little wholesome", idea: "Choose a pet photo from home that belongs in the family group chat. Give that familiar face a fresh caption.", tone: "wholesome" },
  { title: "Campus commute, pet edition", idea: "Try a photo of a furry walking buddy, a pet in a carrier, or your loyal plush mascot ready for class.", tone: "deadpan" },
  { title: "Weekend side quest", idea: "Bring back a pet-friendly snapshot from your weekend wander, or caption the pet who would rather you stayed home.", tone: "chaotic" },
  { title: "The tiniest New Yorker", idea: "Look for a small companion having a big-city day: a park break, a window seat, or a very serious walk.", tone: "wholesome" },
  { title: "Sunday reset, questionable effort", idea: "Your pet or plush companion has a busy schedule of doing nothing. Find the photo that proves it.", tone: "deadpan" },
];

export function getDailyCaptionPrompt(now = new Date()) {
  const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const day = (new Date(`${dateKey}T12:00:00Z`).getUTCDay() + 6) % 7;
  return {
    ...DAILY_PHOTO_IDEAS[day],
    dateKey,
    dateLabel: new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" }).format(now),
  };
}

export type DailyCaptionPrompt = ReturnType<typeof getDailyCaptionPrompt>;

export type CaptionCard = {
  id: string;
  text: string;
  upvotes: number;
  downvotes: number;
  myVote: 1 | -1 | null;
};

export type CaptionImage = {
  id: string;
  imageUrl: string;
  description: string;
  tone: CaptionTone;
  createdAt: string;
  ownedByMe: boolean;
  captions: CaptionCard[];
};

export type CaptionFeed = {
  items: CaptionImage[];
  selectedFrame: CaptionImage | null;
  selectedFrameError: string | null;
  error: string | null;
  hasMore: boolean;
};

export type GenerationState = {
  error?: string;
  success?: string;
  imageId?: string;
};

export type VoteResult = {
  error?: string;
  myVote?: 1 | -1;
  upvotes?: number;
  downvotes?: number;
};

export const MAX_CAPTION_IMAGE_BYTES = 3 * 1024 * 1024;

export function isCaptionTone(value: unknown): value is CaptionTone {
  return value === "deadpan" || value === "chaotic" || value === "wholesome";
}

export function isValidCaptionVote(id: unknown, value: unknown): boolean {
  return (
    typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) &&
    (value === 1 || value === -1)
  );
}
