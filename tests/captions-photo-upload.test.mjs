import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as captionTypes from "../lib/caption-types.ts";

const source = readFileSync(new URL("../lib/caption-photo-upload.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const maxBytes = captionTypes.MAX_CAPTION_IMAGE_BYTES;
const conversionError = /couldn’t convert that HEIC photo/;
const heicFile = () => new File(["heic source"], "DOG.HEIC", { type: "", lastModified: 123456 });

// Execute the real preparation helper with only browser/decoder boundaries
// replaced. The decoder is never loaded and no real timers or network run.
function helperFor({ width = 2400, height = 1600, encoded, decode, noContext = false } = {}) {
  const events = { imports: 0, closes: 0, canvases: [], draws: [], fills: [], encodes: [] };
  const timers = new Map();
  let timerId = 0;
  const bitmap = { width, height, close() { events.closes++; } };
  const exports = {};
  const context = {
    fillStyle: "",
    fillRect(...args) { events.fills.push({ args, color: this.fillStyle }); },
    drawImage(...args) { events.draws.push(args); },
  };
  vm.runInNewContext(compiled, {
    exports, File, Blob,
    require(name) {
      if (name === "./caption-types") return captionTypes;
      assert.equal(name, "heic-to/csp");
      events.imports++;
      return { heicTo: async (options) => {
        assert.equal(options.type, "bitmap");
        assert.ok(options.blob instanceof File);
        return decode ? decode(options) : bitmap;
      } };
    },
    document: { createElement(tag) {
      assert.equal(tag, "canvas");
      const canvas = {
        width: 0, height: 0,
        getContext(kind) { assert.equal(kind, "2d"); return noContext ? null : context; },
        toBlob(callback, type, quality) {
          events.encodes.push({ width: this.width, height: this.height, type, quality });
          callback(encoded === undefined ? new Blob(["jpeg bytes"], { type: "image/jpeg" }) : encoded);
        },
      };
      events.canvases.push(canvas);
      return canvas;
    } },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  return { ...exports, events, timers, bitmap };
}

test("photo validation recognizes ordinary images and HEIC MIME or case-insensitive extensions", () => {
  const helper = helperFor();
  for (const type of ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]) {
    assert.equal(helper.captionPhotoError(new File(["photo"], "photo", { type })), null);
  }
  for (const name of ["DOG.HEIC", "dog.HeIf", "holiday.photo.heic"]) {
    const file = new File(["photo"], name);
    assert.equal(helper.isHeicPhoto(file), true);
    assert.equal(helper.captionPhotoError(file), null);
  }
  assert.equal(helper.isHeicPhoto(new File(["photo"], "dog.heic.jpg", { type: "image/jpeg" })), false);
  for (const specifier of ["image/heic", "image/heif", ".heic", ".heif"]) {
    assert.ok(helper.CAPTION_PHOTO_ACCEPT.split(",").includes(specifier));
  }
  assert.equal(helper.events.imports, 0);
});

test("3 MiB is accepted while empty, oversized, and unsupported inputs fail before decoder loading", async () => {
  const helper = helperFor();
  const atLimit = new File([new Uint8Array(maxBytes)], "dog.heic");
  assert.equal(helper.captionPhotoError(atLimit), null);
  for (const file of [
    new File([], "empty.heic"),
    new File([new Uint8Array(maxBytes + 1)], "large.heic"),
    new File(["text"], "notes.txt", { type: "text/plain" }),
    new File(["photo"], "unknown.bin"),
  ]) {
    assert.ok(helper.captionPhotoError(file));
    await assert.rejects(helper.prepareCaptionPhoto(file), /Choose a/);
  }
  assert.equal(helper.events.imports, 0);
  assert.equal(helper.events.canvases.length, 0);
  assert.equal(helper.timers.size, 0);
});

test("ordinary JPEG, PNG, and WebP files pass through unchanged without loading the decoder", async () => {
  const helper = helperFor();
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    const file = new File(["source bytes"], "pet.photo", { type });
    assert.equal(await helper.prepareCaptionPhoto(file), file);
  }
  assert.equal(helper.events.imports, 0);
  assert.equal(helper.events.canvases.length, 0);
  assert.equal(helper.timers.size, 0);
});

test("HEIC becomes an uploadable JPEG with proportional resize and no enlargement", async () => {
  for (const [width, height, outputWidth, outputHeight] of [
    [2400, 1600, 1200, 800],
    [1500, 3000, 600, 1200],
    [320, 240, 320, 240],
  ]) {
    const helper = helperFor({ width, height });
    const original = heicFile();
    const output = await helper.prepareCaptionPhoto(original);
    assert.ok(output instanceof File);
    assert.equal(output.type, "image/jpeg");
    assert.equal(output.name, "DOG.jpg");
    assert.equal(output.lastModified, original.lastModified);
    assert.equal(await output.text(), "jpeg bytes");
    assert.notEqual(output, original);
    assert.deepEqual(helper.events.encodes, [{ width: outputWidth, height: outputHeight, type: "image/jpeg", quality: 0.85 }]);
    assert.deepEqual(helper.events.fills, [{ args: [0, 0, outputWidth, outputHeight], color: "#ffffff" }]);
    assert.deepEqual(helper.events.draws, [[helper.bitmap, 0, 0, outputWidth, outputHeight]]);
    assert.equal(helper.events.closes, 1);
    assert.equal(helper.events.canvases[0].width, 1);
    assert.equal(helper.events.canvases[0].height, 1);
    assert.equal(helper.timers.size, 0);
  }
});

test("failed or invalid JPEG encoding is rejected and releases bitmap, canvas, and timer", async () => {
  for (const encoded of [
    null,
    new Blob([], { type: "image/jpeg" }),
    new Blob(["not jpeg"], { type: "image/png" }),
    new Blob([new Uint8Array(maxBytes + 1)], { type: "image/jpeg" }),
  ]) {
    const helper = helperFor({ encoded });
    await assert.rejects(helper.prepareCaptionPhoto(heicFile()), conversionError);
    assert.equal(helper.events.closes, 1);
    assert.equal(helper.events.canvases[0].width, 1);
    assert.equal(helper.events.canvases[0].height, 1);
    assert.equal(helper.timers.size, 0);
  }
});

test("invalid decoded dimensions or unavailable canvas reject cleanly", async () => {
  for (const options of [{ width: 0 }, { height: 0 }, { width: 10000, height: 10000 }, { noContext: true }]) {
    const helper = helperFor(options);
    await assert.rejects(helper.prepareCaptionPhoto(heicFile()), conversionError);
    assert.equal(helper.events.closes, 1);
    assert.equal(helper.events.encodes.length, 0);
    assert.equal(helper.timers.size, 0);
    for (const canvas of helper.events.canvases) assert.equal(canvas.width * canvas.height, 1);
  }
});

test("decoder failures expose a useful upload error and clear the timer", async () => {
  const helper = helperFor({ decode() { throw new Error("private decoder diagnostics"); } });
  await assert.rejects(helper.prepareCaptionPhoto(heicFile()), (error) => {
    assert.match(error.message, conversionError);
    assert.doesNotMatch(error.message, /private decoder diagnostics/);
    return true;
  });
  assert.equal(helper.events.closes, 0);
  assert.equal(helper.events.canvases.length, 0);
  assert.equal(helper.timers.size, 0);
});

test("a timed-out conversion releases its late bitmap without creating a preview canvas", async () => {
  let finishDecode;
  let signalStarted;
  const started = new Promise((resolve) => { signalStarted = resolve; });
  const helper = helperFor({ decode: () => new Promise((resolve) => {
    finishDecode = resolve;
    signalStarted();
  }) });
  const pending = assert.rejects(helper.prepareCaptionPhoto(heicFile()), conversionError);
  await started;
  assert.equal(helper.timers.size, 1);
  const timer = [...helper.timers.values()][0];
  assert.equal(timer.delay, 30000);
  timer.callback();
  await pending;
  assert.equal(helper.timers.size, 0);
  finishDecode(helper.bitmap);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(helper.events.closes, 1);
  assert.equal(helper.events.canvases.length, 0);
});
