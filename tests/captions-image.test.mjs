import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { sanitizeCaptionImage } from "../lib/caption-image.ts";

test("uploaded images are decoded, resized, converted to WebP, and stripped of metadata", async () => {
  const source = await sharp({ create: { width: 1600, height: 800, channels: 3, background: "pink" } })
    .withExif({ IFD0: { Artist: "Sensitive camera owner" } }).png().toBuffer();
  assert.ok((await sharp(source).metadata()).exif);
  const result = await sanitizeCaptionImage(new File([source], "photo.png", { type: "image/png" }));
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 600);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.ok(result.length < 3 * 1024 * 1024);
});

test("a claimed JPEG MIME type cannot turn HTML or SVG into an accepted photo", async () => {
  for (const source of ["<html>not a photo</html>", '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>']) {
    await assert.rejects(sanitizeCaptionImage(new File([source], "photo.jpg", { type: "image/jpeg" })));
  }
});

test("empty files, unsupported MIME types, and oversized uploads fail before image processing", async () => {
  for (const file of [
    new File([], "empty.png", { type: "image/png" }),
    new File(["text"], "document.txt", { type: "text/plain" }),
    new File([Buffer.alloc(3 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }),
  ]) await assert.rejects(sanitizeCaptionImage(file), /INVALID_IMAGE/);
});
