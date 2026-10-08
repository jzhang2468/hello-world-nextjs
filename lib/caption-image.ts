import sharp from "sharp";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export async function sanitizeCaptionImage(image: File): Promise<Buffer> {
  if (
    image.size < 1 || image.size > MAX_IMAGE_BYTES ||
    !["image/jpeg", "image/png", "image/webp"].includes(image.type)
  ) throw new Error("INVALID_IMAGE");

  const decoder = sharp(Buffer.from(await image.arrayBuffer()), {
    limitInputPixels: 40_000_000,
    failOn: "error",
  });
  const metadata = await decoder.metadata();
  if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages ?? 1) !== 1) {
    throw new Error("INVALID_IMAGE");
  }
  // A decoded, resized, metadata-free WebP is the only data sent to storage or
  // the vision model. SQL keeps a path, never these bytes or their data URL.
  const sanitized = await decoder.rotate()
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
  if (sanitized.length > MAX_IMAGE_BYTES) throw new Error("INVALID_IMAGE");
  return sanitized;
}
