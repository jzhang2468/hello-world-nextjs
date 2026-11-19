import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import sharp from "sharp";
import ts from "typescript";
import { isCaptionFrameId } from "../lib/caption-types.ts";

const owner = "3c0b9e63-a1c9-4279-8c99-d898ff7cfdaa";
const frameId = "f8f8cdd5-c107-495b-b4a1-63fb32189df7";
const path = `${owner}/${frameId}.webp`;
const source = readFileSync(new URL("../app/captions/[frameId]/instagram-photo/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function exportPhoto(client, id = frameId) {
  const modules = {
    sharp: { default: sharp },
    "@/lib/caption-types": { isCaptionFrameId },
    "@/lib/supabase/server": { createClient: async () => client },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (name) => modules[name], Response, Buffer, Uint8Array });
  return exports.GET(new Request("https://example.test"), { params: Promise.resolve({ frameId: id }) });
}

function memberClient(row, image) {
  const filters = {};
  const downloads = [];
  const query = {
    select() { return this; },
    eq(key, value) { filters[key] = value; return this; },
    async maybeSingle() {
      return { data: row && Object.entries(filters).every(([key, value]) => row[key] === value) ? row : null };
    },
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: owner } } }) },
    from(table) { assert.equal(table, "caption_images"); return query; },
    storage: {
      from(bucket) {
        assert.equal(bucket, "caption-images");
        return { download: async (key) => { downloads.push(key); return { data: image }; } };
      },
    },
  };
  return { client, filters, downloads };
}

const row = { id: frameId, owner_id: owner, status: "ready", image_path: path };

test("the owner can export their ready photo as a private, metadata-free JPEG", async () => {
  const input = await sharp({ create: { width: 24, height: 20, channels: 4, background: "#0000" } })
    .withExif({ IFD0: { Artist: "Private name" } }).webp().toBuffer();
  const { client, filters, downloads } = memberClient(row, new Blob([input]));
  const response = await exportPhoto(client, frameId.toUpperCase());
  assert.equal(response.status, 200);
  assert.deepEqual(filters, { id: frameId, owner_id: owner, status: "ready" });
  assert.deepEqual(downloads, [path]);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Content-Type"), "image/jpeg");
  assert.equal(response.headers.get("Content-Disposition"), `attachment; filename="furframe-${frameId}.jpg"`);
  const output = sharp(Buffer.from(await response.arrayBuffer()));
  const metadata = await output.metadata();
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.width, 24);
  assert.equal(metadata.height, 20);
  assert.deepEqual(Array.from((await output.raw().toBuffer()).subarray(0, 3)), [255, 255, 255]);
});

test("missing, foreign, unfinished, or path-mismatched frames cannot be exported", async () => {
  for (const stored of [null, { ...row, owner_id: "someone-else" }, { ...row, status: "processing" }, { ...row, image_path: "some-other-photo.webp" }]) {
    const { client, downloads } = memberClient(stored);
    const response = await exportPhoto(client);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(downloads, []);
  }
});

test("unauthenticated users, malformed IDs, and unavailable originals receive uncached errors", async () => {
  const signedOut = { auth: { getUser: async () => ({ data: { user: null } }) } };
  const { client } = memberClient(row, null);
  for (const [response, status] of [[await exportPhoto(signedOut), 401], [await exportPhoto({}, "../other"), 404], [await exportPhoto(client), 503]]) {
    assert.equal(response.status, status);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
});
