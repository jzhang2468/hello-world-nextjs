"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  isCaptionTone,
  isValidCaptionVote,
  MAX_CAPTION_IMAGE_BYTES,
  type GenerationState,
  type VoteResult,
} from "@/lib/caption-types";
import { sanitizeCaptionImage } from "@/lib/caption-image";
import {
  CAPTION_PROMPT_VERSION,
  CaptionGenerationError,
  generateCaptions,
  getCaptionModel,
  getCaptionServiceStatus,
  getPipelineSecret,
} from "@/lib/caption-generation";

const generationMessages = {
  GENERATION_UNAVAILABLE: "The caption studio is unavailable right now. Please try again later.",
  GENERATION_TIMEOUT: "That took a little too long. Please try again in a moment.",
  GENERATION_REFUSED: "We could not create captions for this photo. Please try a different image.",
  GENERATION_INVALID_OUTPUT: "The captions did not come out quite right. Please try again in a moment.",
};

export async function generateCaptionSet(
  _previous: GenerationState,
  formData: FormData,
): Promise<GenerationState> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: "Please sign in before making captions." };

    const image = formData.get("image");
    const tone = formData.get("tone");
    if (!isCaptionTone(tone)) return { error: "Choose a caption mood: deadpan, chaotic, or wholesome." };
    if (!(image instanceof File) || image.size < 1 || image.size > MAX_CAPTION_IMAGE_BYTES ||
      !["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
      return { error: "Choose a JPG, PNG, or WebP photo that is 3 MB or smaller." };
    }
    const pipelineSecret = getPipelineSecret();
    if (!getCaptionServiceStatus().configured || !pipelineSecret) return { error: generationMessages.GENERATION_UNAVAILABLE };

    let sanitized: Buffer;
    try {
      sanitized = await sanitizeCaptionImage(image);
    } catch {
      return { error: "We could not read that photo. Choose a still JPG, PNG, or WebP image under 3 MB." };
    }
    const model = getCaptionModel();
    const imageId = randomUUID();
    const imagePath = `${user.id}/${imageId}.webp`;
    const { error: reservationError } = await supabase.rpc("reserve_caption_image", {
      p_image_id: imageId,
      p_tone: tone,
      p_model: model,
      p_prompt_version: CAPTION_PROMPT_VERSION,
      p_pipeline_secret: pipelineSecret,
    });
    if (reservationError) {
      if (reservationError.message.includes("CAPTION_RATE_LIMIT")) return { error: "Give the studio a moment. You can start another photo in 30 seconds." };
      if (reservationError.message.includes("CAPTION_DAILY_LIMIT")) return { error: "You’ve used your 10 photo sessions for today. Come back tomorrow for more." };
      return { error: "We could not start this photo session. Please try again shortly." };
    }

    let failureCode = "UPLOAD_FAILED";
    try {
      const { error: uploadError } = await supabase.storage.from("caption-images").upload(imagePath, sanitized, {
        contentType: "image/webp",
        upsert: false,
      });
      if (uploadError) throw new Error("UPLOAD_FAILED");
      failureCode = "GENERATION_UNAVAILABLE";
      const { description, captions } = await generateCaptions(sanitized, tone, model, imagePath, async (stage, prompt) => {
        const { error: promptError } = await supabase.rpc("record_caption_generation_step", {
          p_image_id: imageId,
          p_stage: stage,
          p_prompt: prompt,
          p_pipeline_secret: pipelineSecret,
        });
        if (promptError) {
          failureCode = "SAVE_FAILED";
          throw new Error("PROMPT_SAVE_FAILED");
        }
      });
      failureCode = "SAVE_FAILED";
      const { error: saveError } = await supabase.rpc("complete_caption_image", {
        p_image_id: imageId,
        p_description: description,
        p_captions: captions,
        p_pipeline_secret: pipelineSecret,
      });
      if (saveError) {
        // A lost RPC response can follow a successful commit. Check before
        // cleanup so a ready photo never loses its storage object.
        const { data: persisted } = await supabase.from("caption_images")
          .select("status").eq("id", imageId).eq("owner_id", user.id).maybeSingle();
        if (persisted?.status !== "ready") throw new Error("SAVE_FAILED");
      }
      revalidatePath("/captions");
      return { success: "Three captions, one very good photo. Let the voting begin!", imageId };
    } catch (error) {
      if (error instanceof CaptionGenerationError) failureCode = error.code;
      // Mark failure first. A ready row cannot be failed; if the database is
      // unreachable, retain the private object for later cleanup rather than
      // risk removing an image whose completion may already have committed.
      try {
        const { error: markError } = await supabase.rpc("fail_caption_image", {
          p_image_id: imageId,
          p_error_code: failureCode,
          p_pipeline_secret: pipelineSecret,
        });
        if (!markError) await supabase.storage.from("caption-images").remove([imagePath]);
      } catch {
        // The original error remains the response; no provider details leak.
      }
      if (error instanceof CaptionGenerationError) return { error: generationMessages[error.code] };
      return { error: failureCode === "UPLOAD_FAILED" ? "Your photo could not be uploaded. Please try again." : "Your captions could not be saved. Please try again shortly." };
    }
  } catch {
    return { error: "The caption studio is unavailable right now. Please try again shortly." };
  }
}

export async function voteOnCaption(captionId: string, value: 1 | -1): Promise<VoteResult> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: "Please sign in before rating captions." };
    if (!isValidCaptionVote(captionId, value)) return { error: "Choose an upvote or downvote on a valid caption." };

    // A first vote creates a new row. A repeated or changed vote updates only
    // that user's row; the database unique constraint also handles two tabs.
    const inserted = await supabase.from("caption_votes")
      .insert({ caption_id: captionId, user_id: user.id, value })
      .select("value").single();
    let savedVote = inserted.data;
    if (inserted.error?.code === "23505") {
      const updated = await supabase.from("caption_votes").update({ value })
        .eq("caption_id", captionId).eq("user_id", user.id)
        .select("value").single();
      if (updated.error || !updated.data) return { error: "Your vote could not be saved. Refresh and try again." };
      savedVote = updated.data;
    } else if (inserted.error || !savedVote) {
      return { error: "Your vote could not be saved. Refresh and try again." };
    }
    const { data: totals } = await supabase.rpc("get_caption_vote_totals", { p_caption_ids: [captionId] });
    revalidatePath("/captions");
    return {
      myVote: savedVote!.value as 1 | -1,
      ...(totals?.[0] ? { upvotes: Number(totals[0].upvotes), downvotes: Number(totals[0].downvotes) } : {}),
    };
  } catch {
    return { error: "Your vote could not be saved. Please try again shortly." };
  }
}
