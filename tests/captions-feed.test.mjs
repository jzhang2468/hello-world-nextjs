import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as captionTypes from "../lib/caption-types.ts";

const source = readFileSync(new URL("../lib/captions.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const idFor = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const image = (number, ownerId = owner) => ({
  id: idFor(number), owner_id: ownerId, image_path: `${ownerId}/${idFor(number)}.webp`,
  description: `Photo ${number}`, tone: "deadpan", status: "ready", created_at: new Date(1_800_000_000_000 + number * 1000).toISOString(),
  captions: [0, 1, 2].map((position) => ({ id: idFor(10000 + number * 3 + position), text: `Caption ${number}.${position}`, position })),
});

function fixture({ rows = [], user = owner, topIds = [], failPage = false } = {}) {
  const calls = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: user ? { id: user } : null }, error: null }) },
    from(table) {
      const filters = [];
      const orders = [];
      let range = null;
      let inFilter = null;
      const evaluate = () => {
        calls.push({ table, filters: [...filters], range, orders: [...orders] });
        if (table === "caption_votes") return { data: [], error: null };
        if (failPage && range) return { data: null, error: { message: "unavailable" } };
        let result = rows.filter((row) => filters.every(([column, value]) => row[column] === value));
        if (inFilter) result = result.filter((row) => inFilter[1].includes(row[inFilter[0]]));
        result.sort((a, b) => {
          for (const [key, direction] of orders) {
            const delta = String(a[key]).localeCompare(String(b[key]));
            if (delta) return direction.ascending ? delta : -delta;
          }
          return 0;
        });
        if (range) result = result.slice(range[0], range[1] + 1);
        return { data: result, error: null };
      };
      const query = {
        select() { return query; },
        eq(key, value) { filters.push([key, value]); return query; },
        order(key, direction) { orders.push([key, direction]); return query; },
        range(start, end) { range = [start, end]; return query; },
        in(key, values) { inFilter = [key, values]; return query; },
        maybeSingle: async () => { const result = evaluate(); return { ...result, data: result.data?.[0] ?? null }; },
        then(resolve, reject) { return Promise.resolve(evaluate()).then(resolve, reject); },
      };
      return query;
    },
    rpc: async (name, args) => {
      calls.push({ rpc: name, args });
      if (name === "get_top_caption_image_ids") return { data: topIds.slice(args.p_offset, args.p_offset + args.p_limit).map((image_id) => ({ image_id })), error: null };
      assert.equal(name, "get_caption_vote_totals");
      return { data: args.p_caption_ids.map((caption_id) => ({ caption_id, upvotes: 2, downvotes: 1 })), error: null };
    },
    storage: { from: () => ({ createSignedUrls: async (paths) => ({ data: paths.map((path) => ({ path, signedUrl: `https://private.invalid/${path}?expires=soon` })), error: null }) }) },
  };
  const exports = {};
  const modules = { "server-only": {}, "@/lib/caption-types": captionTypes, "@/lib/supabase/server": { createClient: async () => supabase }, "@/lib/caption-generation": {} };
  vm.runInNewContext(compiled, { exports, require: (name) => {
    assert.ok(name in modules, `Unexpected dependency ${name}`);
    return modules[name];
  } });
  return { getFeed: exports.getCaptionFeed, calls };
}

test("My frames filters by verified owner before paging, independently of newer club frames", async () => {
  const rows = [...Array.from({ length: 30 }, (_, index) => image(index + 1)), ...Array.from({ length: 50 }, (_, index) => image(index + 100, other))];
  const { getFeed, calls } = fixture({ rows });
  const first = await getFeed({ mode: "mine", page: 1 });
  assert.equal(first.items.length, 24);
  assert.equal(first.items[0].id, idFor(30));
  assert.equal(first.hasMore, true);
  const second = await getFeed({ mode: "mine", page: 2 });
  assert.deepEqual(Array.from(second.items, (item) => item.id), [6, 5, 4, 3, 2, 1].map(idFor));
  assert.equal(second.hasMore, false);
  assert.ok(second.items.every((item) => item.ownedByMe));
  const imageQueries = calls.filter((call) => call.table === "caption_images");
  assert.ok(imageQueries.every((call) => call.filters.some(([key, value]) => key === "owner_id" && value === owner)));
  assert.deepEqual(Array.from(imageQueries[1].range), [24, 48]);
});

test("Top frames retain database rank order and use a bounded pagination lookahead", async () => {
  const rows = Array.from({ length: 30 }, (_, index) => image(index + 1));
  const topIds = rows.map((row) => row.id).reverse();
  [topIds[0], topIds[1]] = [topIds[1], topIds[0]];
  const { getFeed, calls } = fixture({ rows, topIds });
  const result = await getFeed({ mode: "top", page: 1 });
  assert.deepEqual(Array.from(result.items, (item) => item.id), topIds.slice(0, 24));
  assert.equal(result.hasMore, true);
  const ranking = calls.find((call) => call.rpc === "get_top_caption_image_ids");
  assert.equal(ranking.args.p_limit, 25);
  assert.equal(ranking.args.p_offset, 0);
  await getFeed({ mode: "top", page: 2 });
  assert.equal(calls.filter((call) => call.rpc === "get_top_caption_image_ids")[1].args.p_offset, 24);
});

test("an older shared frame loads independently of My frames, pagination, or gallery failure", async () => {
  const shared = image(1, other);
  const rows = [shared, ...Array.from({ length: 30 }, (_, index) => image(index + 2))];
  for (const failPage of [false, true]) {
    const { getFeed } = fixture({ rows, failPage });
    const result = await getFeed({ mode: "mine", page: 2, frameId: shared.id });
    assert.equal(result.selectedFrame.id, shared.id);
    assert.equal(result.selectedFrame.ownedByMe, false);
    assert.equal(result.selectedFrameError, null);
    assert.equal(Boolean(result.error), failPage);
    assert.ok(result.items.every((item) => item.ownedByMe));
  }
});

test("signed-out visitors cannot query image rows, votes, or signed URLs", async () => {
  const { getFeed, calls } = fixture({ user: null, rows: [image(1)] });
  const result = await getFeed({ mode: "top", frameId: idFor(1) });
  assert.match(result.error, /sign in/i);
  assert.equal(result.items.length, 0);
  assert.equal(result.selectedFrame, null);
  assert.equal(calls.length, 0);
});

test("invalid frame identifiers never reach an ID query and unavailable frames stay unavailable", async () => {
  const { getFeed, calls } = fixture({ rows: [{ ...image(1), status: "processing" }] });
  const invalid = await getFeed({ frameId: "javascript:alert(1)" });
  assert.equal(invalid.selectedFrame, null);
  assert.ok(calls.every((call) => !call.filters?.some(([key]) => key === "id")));
  const pending = await getFeed({ frameId: idFor(1) });
  assert.equal(pending.selectedFrame, null);
  assert.match(pending.selectedFrameError, /unavailable/);
});

test("URL options only accept supported modes, bounded pages, and UUID frame IDs", () => {
  assert.deepEqual(captionTypes.captionFeedOptions({ view: "mine", page: "2", frame: idFor(1) }), { mode: "mine", page: 2, frameId: idFor(1) });
  for (const page of ["-1", "0", "NaN", "1.2", ["2"], "90000"]) assert.equal(captionTypes.captionFeedOptions({ page }).page, 1);
  assert.equal(captionTypes.captionFeedOptions({ page: "999" }).page, 417);
  assert.deepEqual(captionTypes.captionFeedOptions({ view: "javascript:alert(1)", frame: [idFor(1)] }), { mode: "fresh", page: 1, frameId: null });
});

test("daily ideas stay stable within a New York day and change at local midnight", () => {
  const morning = captionTypes.getDailyCaptionPrompt(new Date("2026-10-08T04:00:00Z"));
  const evening = captionTypes.getDailyCaptionPrompt(new Date("2026-10-09T03:59:59Z"));
  const tomorrow = captionTypes.getDailyCaptionPrompt(new Date("2026-10-09T04:00:00Z"));
  assert.deepEqual(morning, evening);
  assert.equal(morning.dateKey, "2026-10-08");
  assert.notEqual(morning.title, tomorrow.title);
  assert.equal(tomorrow.dateKey, "2026-10-09");
  assert.ok(captionTypes.isCaptionTone(morning.tone));
});
