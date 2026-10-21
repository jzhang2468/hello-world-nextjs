import "server-only";

import { CAPTION_PAGE_SIZE, MAX_CAPTION_PAGE, isCaptionFrameId, type CaptionFeed, type CaptionFeedMode, type CaptionImage, type CaptionTone } from "@/lib/caption-types";
import { createClient } from "@/lib/supabase/server";

export { getCaptionServiceStatus } from "@/lib/caption-generation";

type ImageRow = {
  id: string;
  owner_id: string;
  image_path: string;
  description: string;
  tone: CaptionTone;
  created_at: string;
  admin_edited_at: string | null;
  captions: { id: string; text: string; position: number }[];
};

type VoteTotal = { caption_id: string; upvotes: number | string; downvotes: number | string };
const IMAGE_COLUMNS = "id, owner_id, image_path, description, tone, created_at, admin_edited_at, captions(id, text, position)";
const emptyFeed = (): CaptionFeed => ({ items: [], selectedFrame: null, selectedFrameError: null, error: null, hasMore: false });

export async function getCaptionFeed({ mode = "fresh", page = 1, frameId = null }: {
  mode?: CaptionFeedMode;
  page?: number;
  frameId?: string | null;
} = {}): Promise<CaptionFeed> {
  page = Number.isInteger(page) ? Math.min(Math.max(page, 1), MAX_CAPTION_PAGE) : 1;
  frameId = isCaptionFrameId(frameId) ? frameId.toLowerCase() : null;
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { ...emptyFeed(), error: "Sign in to see the Caption Club." };
    const offset = (page - 1) * CAPTION_PAGE_SIZE;

    const loadPage = async (): Promise<{ rows: ImageRow[]; error: boolean }> => {
      if (mode === "top") {
        const ranked = await supabase.rpc("get_top_caption_image_ids", { p_limit: CAPTION_PAGE_SIZE + 1, p_offset: offset });
        if (ranked.error) return { rows: [], error: true };
        const ids = ((ranked.data ?? []) as { image_id: string }[]).map((row) => row.image_id);
        if (!ids.length) return { rows: [], error: false };
        const result = await supabase.from("caption_images").select(IMAGE_COLUMNS).eq("status", "ready").in("id", ids);
        const byId = new Map(((result.data ?? []) as ImageRow[]).map((row) => [row.id, row]));
        return { rows: ids.flatMap((id) => byId.has(id) ? [byId.get(id)!] : []), error: Boolean(result.error) };
      }
      let query = supabase.from("caption_images").select(IMAGE_COLUMNS).eq("status", "ready");
      // Filter in Postgres before paging, so personal history is independent of
      // how many frames the rest of the club has posted.
      if (mode === "mine") query = query.eq("owner_id", user.id);
      const result = await query.order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(offset, offset + CAPTION_PAGE_SIZE);
      return { rows: (result.data ?? []) as ImageRow[], error: Boolean(result.error) };
    };
    const [feed, selected] = await Promise.all([
      loadPage(),
      frameId ? supabase.from("caption_images").select(IMAGE_COLUMNS).eq("status", "ready").eq("id", frameId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    const pageRows = feed.rows.slice(0, CAPTION_PAGE_SIZE);
    const selectedRow = selected.data as ImageRow | null;
    const allRows = [...new Map([...pageRows, ...(selectedRow ? [selectedRow] : [])].map((row) => [row.id, row])).values()];
    const result: CaptionFeed = {
      ...emptyFeed(),
      hasMore: feed.rows.length > CAPTION_PAGE_SIZE && page < MAX_CAPTION_PAGE,
      error: feed.error ? "The caption wall is taking a moment. Please try again shortly." : null,
      selectedFrameError: frameId && !selectedRow
        ? selected.error ? "This shared frame could not load. Refresh to try again." : "This frame is unavailable. It may have been removed or is not ready to share."
        : null,
    };
    if (!allRows.length) return result;

    const ids = allRows.flatMap((row) => row.captions.map((caption) => caption.id));
    const [images, votes, totals] = await Promise.all([
      supabase.storage.from("caption-images").createSignedUrls(allRows.map((row) => row.image_path), 60 * 30),
      supabase.from("caption_votes").select("caption_id, value").eq("user_id", user.id).in("caption_id", ids),
      supabase.rpc("get_caption_vote_totals", { p_caption_ids: ids }),
    ]);
    if (images.error || votes.error || totals.error) {
      return { ...result, error: "We could not load the caption wall. Refresh to try again.", selectedFrameError: frameId ? "This shared frame could not load. Refresh to try again." : null };
    }
    const signedUrls = new Map((images.data ?? []).map((image) => [image.path, image.signedUrl]));
    const ownVotes = new Map((votes.data ?? []).map((vote) => [vote.caption_id, vote.value as 1 | -1]));
    const voteTotals = new Map(((totals.data ?? []) as VoteTotal[]).map((total) => [total.caption_id, total]));
    const hydrated = new Map<string, CaptionImage>();
    for (const row of allRows) {
      const imageUrl = signedUrls.get(row.image_path);
      if (!imageUrl) continue;
      hydrated.set(row.id, {
        id: row.id,
        imageUrl,
        description: row.description,
        tone: row.tone,
        createdAt: row.created_at,
        adminEditedAt: row.admin_edited_at ?? null,
        ownedByMe: row.owner_id === user.id,
        captions: [...row.captions].sort((a, b) => a.position - b.position).map((caption) => ({
          id: caption.id,
          text: caption.text,
          upvotes: Number(voteTotals.get(caption.id)?.upvotes ?? 0),
          downvotes: Number(voteTotals.get(caption.id)?.downvotes ?? 0),
          myVote: ownVotes.get(caption.id) ?? null,
        })),
      });
    }
    result.items = pageRows.flatMap((row) => hydrated.has(row.id) ? [hydrated.get(row.id)!] : []);
    result.selectedFrame = frameId ? hydrated.get(frameId) ?? null : null;
    if (result.items.length < pageRows.length) result.error = "Some photos could not load. Refresh to try again.";
    if (selectedRow && !result.selectedFrame) result.selectedFrameError = "This shared photo could not load. Refresh to try again.";
    return result;
  } catch {
    return { ...emptyFeed(), error: "We could not load the caption wall. Please try again shortly.", selectedFrameError: frameId ? "This shared frame could not load. Refresh to try again." : null };
  }
}
