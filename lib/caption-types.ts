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
  adminEditedAt: string | null;
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
  errorCode?: "PET_PHOTO_REQUIRED";
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
