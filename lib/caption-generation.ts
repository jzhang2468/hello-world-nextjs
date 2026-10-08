import "server-only";

import type { CaptionTone } from "@/lib/caption-types";
import { CaptionGenerationError, runCaptionChain, type SaveCaptionPrompt } from "@/lib/caption-generation-core";

export { CAPTION_PROMPT_VERSION, CaptionGenerationError } from "@/lib/caption-generation-core";

export function getCaptionServiceStatus(): { configured: boolean } {
  return { configured: Boolean(process.env.OPENAI_API_KEY?.trim()) && Boolean(getPipelineSecret()) };
}

export function getPipelineSecret(): string | null {
  const secret = process.env.CAPTION_PIPELINE_SECRET;
  return secret && /^[a-f0-9]{64}$/.test(secret) ? secret : null;
}

export function getCaptionModel(): string {
  const model = process.env.OPENAI_CAPTION_MODEL?.trim() || "gpt-4.1-mini";
  if (model.length > 80 || !/^[a-zA-Z0-9._:-]+$/.test(model)) {
    throw new CaptionGenerationError("GENERATION_UNAVAILABLE");
  }
  return model;
}

export async function generateCaptions(image: Buffer, tone: CaptionTone, model: string, imagePath: string, savePrompt: SaveCaptionPrompt) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new CaptionGenerationError("GENERATION_UNAVAILABLE");
  return runCaptionChain({ apiKey, model, image, tone, imagePath, savePrompt });
}
