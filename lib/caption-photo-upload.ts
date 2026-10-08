import { MAX_CAPTION_IMAGE_BYTES } from "./caption-types";

export const CAPTION_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
const REGULAR_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const HEIC_PHOTO_TYPES = ["image/heic", "image/heif"];

export function isHeicPhoto(file: File): boolean {
  return HEIC_PHOTO_TYPES.includes(file.type.toLowerCase()) || /\.(heic|heif)$/i.test(file.name);
}

export function captionPhotoError(file: File): string | null {
  if (file.size === 0 || file.size > MAX_CAPTION_IMAGE_BYTES) {
    return "Choose a photo that’s 3 MB or smaller.";
  }
  if (!REGULAR_PHOTO_TYPES.includes(file.type) && !isHeicPhoto(file)) {
    return "Choose a JPEG, PNG, WebP, HEIC, or HEIF photo.";
  }
  return null;
}

// This module is used only by the upload UI. Load the decoder when a HEIC is
// selected, never during SSR or for ordinary JPEG/PNG/WebP uploads.
export async function prepareCaptionPhoto(file: File): Promise<File> {
  const validationError = captionPhotoError(file);
  if (validationError) throw new Error(validationError);
  if (!isHeicPhoto(file)) return file;

  let bitmap: ImageBitmap | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const conversion = (async () => {
      const { heicTo } = await import("heic-to/csp");
      return heicTo({ blob: file, type: "bitmap" });
    })();
    // The library's decoder runs in a worker. A late result must release its
    // bitmap even if the UI has already recovered from the timeout.
    void conversion.then((result) => { if (timedOut) result.close(); }, () => {});
    bitmap = await Promise.race([
      conversion,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { timedOut = true; reject(new Error("HEIC_TIMEOUT")); }, 30_000);
      }),
    ]);
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 60_000_000) {
      throw new Error("INVALID_HEIC_DIMENSIONS");
    }
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("CANVAS_UNAVAILABLE");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise<Blob>((resolve, reject) => {
      canvas!.toBlob((blob) => blob ? resolve(blob) : reject(new Error("JPEG_ENCODING_FAILED")), "image/jpeg", 0.85);
    });
    if (jpeg.type !== "image/jpeg" || jpeg.size === 0 || jpeg.size > MAX_CAPTION_IMAGE_BYTES) {
      throw new Error("INVALID_CONVERTED_PHOTO");
    }
    return new File([jpeg], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    throw new Error("We couldn’t convert that HEIC photo. Try another photo, or export it as JPEG and upload again.");
  } finally {
    if (timer) clearTimeout(timer);
    bitmap?.close();
    if (canvas) { canvas.width = 1; canvas.height = 1; }
  }
}
