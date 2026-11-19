import sharp from "sharp";
import { isCaptionFrameId } from "@/lib/caption-types";
import { createClient } from "@/lib/supabase/server";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

function errorResponse(status: number, message: string) {
  return new Response(message, { status, headers: privateHeaders });
}

export async function GET(_request: Request, { params }: { params: Promise<{ frameId: string }> }) {
  const { frameId } = await params;
  if (!isCaptionFrameId(frameId)) return errorResponse(404, "Photo not found.");

  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return errorResponse(401, "Sign in to export your photo.");

    const id = frameId.toLowerCase();
    const { data: frame, error } = await supabase.from("caption_images")
      .select("image_path").eq("id", id).eq("owner_id", user.id).eq("status", "ready").maybeSingle();
    if (error) return errorResponse(503, "Your photo is temporarily unavailable.");
    if (frame?.image_path !== `${user.id}/${id}.webp`) return errorResponse(404, "Photo not found.");

    const { data: image, error: storageError } = await supabase.storage
      .from("caption-images").download(frame.image_path);
    if (storageError || !image) return errorResponse(503, "Your photo is temporarily unavailable.");

    const jpeg = await sharp(Buffer.from(await image.arrayBuffer()), { limitInputPixels: 40_000_000 })
      .rotate().flatten({ background: "#fff" }).jpeg({ quality: 90 }).toBuffer();
    return new Response(new Uint8Array(jpeg), {
      headers: {
        ...privateHeaders,
        "Content-Type": "image/jpeg",
        "Content-Disposition": `attachment; filename="furframe-${id}.jpg"`,
      },
    });
  } catch {
    return errorResponse(503, "Your photo is temporarily unavailable.");
  }
}
