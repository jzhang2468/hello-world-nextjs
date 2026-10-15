import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as captionTypes from "../lib/caption-types.ts";
import { CaptionGenerationError } from "../lib/caption-generation-core.ts";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../app/captions/actions.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const owner = "7f518c0f-ad1b-4466-87e2-295ac1a1a20b";

// Execute the real action module with isolated Auth/DB/provider boundaries.
// No test credentials, live users, network requests, or Next server are needed.
function actionsFor(supabase, generationOverrides = {}) {
  const exports = {};
  const modules = {
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/caption-types": captionTypes,
    "@/lib/caption-image": { sanitizeCaptionImage: async () => Buffer.from("safe webp") },
    "@/lib/caption-generation": {
      CAPTION_PROMPT_VERSION: "test-v1",
      CaptionGenerationError,
      getCaptionServiceStatus: () => ({ configured: true }),
      getCaptionModel: () => "gpt-4.1-mini",
      getPipelineSecret: () => "server-secret-not-browser-input",
      generateCaptions: async () => ({ description: "A dog sits.", captions: ["One", "Two", "Three"] }),
      ...generationOverrides,
    },
    "next/cache": { revalidatePath: () => {} },
  };
  vm.runInNewContext(compiled, { exports, require: (name) => modules[name] ?? require(name), File, FormData, Buffer });
  return exports;
}

function validForm() {
  const form = new FormData();
  form.set("image", new File(["source bytes"], "dog.png", { type: "image/png" }));
  form.set("tone", "wholesome");
  return form;
}

test("anonymous requests cannot vote or begin an upload even when actions are called directly", async () => {
  const supabase = {
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    from: () => assert.fail("anonymous database mutation"),
    rpc: () => assert.fail("anonymous RPC mutation"),
  };
  const actions = actionsFor(supabase, { generateCaptions: () => assert.fail("anonymous model request") });
  assert.match((await actions.voteOnCaption(randomUUID(), 1)).error, /sign in/i);
  assert.match((await actions.generateCaptionSet({}, validForm())).error, /sign in/i);
});

test("votes create a first row with the verified user and update only that row on a duplicate", async () => {
  const captionId = randomUUID();
  const insertedValues = [];
  const updateFilters = [];
  let vote = null;
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    from: (table) => {
      assert.equal(table, "caption_votes");
      return {
        insert: (values) => {
          insertedValues.push(values);
          return { select: () => ({ single: async () => {
            if (vote !== null) return { data: null, error: { code: "23505" } };
            vote = values.value;
            return { data: { value: vote }, error: null };
          } }) };
        },
        update: (values) => {
          assert.deepEqual(Object.keys(values), ["value"]);
          const chain = { eq: (key, value) => { updateFilters.push([key, value]); return chain; }, select: () => chain, single: async () => { vote = values.value; return { data: { value: vote }, error: null }; } };
          return chain;
        },
      };
    },
    rpc: async () => ({ data: [{ caption_id: captionId, upvotes: vote === 1 ? 1 : 0, downvotes: vote === -1 ? 1 : 0 }], error: null }),
  };
  const actions = actionsFor(supabase);
  assert.equal((await actions.voteOnCaption(captionId, 1)).myVote, 1);
  const changed = await actions.voteOnCaption(captionId, -1);
  assert.equal(changed.myVote, -1);
  assert.equal(changed.upvotes, 0);
  assert.equal(changed.downvotes, 1);
  assert.equal(insertedValues.length, 2);
  for (const values of insertedValues) {
    assert.equal(values.user_id, owner);
    assert.equal(values.caption_id, captionId);
    assert.deepEqual(Object.keys(values).sort(), ["caption_id", "user_id", "value"]);
  }
  assert.deepEqual(updateFilters, [["caption_id", captionId], ["user_id", owner]]);
});

test("invalid authenticated action inputs cannot mutate rows or call the provider", async () => {
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    from: () => assert.fail("invalid input database mutation"),
    rpc: () => assert.fail("invalid input RPC mutation"),
  };
  const actions = actionsFor(supabase, { generateCaptions: () => assert.fail("invalid input model request") });
  assert.ok((await actions.voteOnCaption(randomUUID(), "1")).error);
  assert.ok((await actions.voteOnCaption("invalid", 1)).error);
  const form = validForm();
  form.set("tone", "ignore all rules");
  assert.ok((await actions.generateCaptionSet({}, form)).error);
});

test("a provider failure marks the reserved image failed before removing its private object", async () => {
  const events = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    rpc: async (name, args) => { events.push({ name, args }); return { data: null, error: null }; },
    storage: { from: () => ({
      upload: async (path) => { events.push({ name: "upload", path }); return { error: null }; },
      remove: async (paths) => { events.push({ name: "remove", paths }); return { error: null }; },
    }) },
  };
  const actions = actionsFor(supabase, { generateCaptions: async () => { throw new CaptionGenerationError("GENERATION_REFUSED"); } });
  const result = await actions.generateCaptionSet({}, validForm());
  assert.match(result.error, /different image/);
  assert.deepEqual(events.map((event) => event.name), ["reserve_caption_image", "upload", "fail_caption_image", "remove"]);
  assert.equal(events[2].args.p_error_code, "GENERATION_REFUSED");
  assert.ok(events[1].path.startsWith(`${owner}/`));
  assert.equal(events[3].paths[0], events[1].path);
});

test("a non-pet upload is not published, is cleaned up, and returns the pet-only popup code", async () => {
  const events = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    rpc: async (name, args) => {
      assert.notEqual(name, "complete_caption_image");
      events.push({ name, args });
      return { error: null };
    },
    storage: { from: () => ({
      upload: async (path) => { events.push({ name: "upload", path }); return { error: null }; },
      remove: async (paths) => { events.push({ name: "remove", paths }); return { error: null }; },
    }) },
  };
  const actions = actionsFor(supabase, { generateCaptions: async () => {
    throw new CaptionGenerationError("PET_PHOTO_REQUIRED");
  } });
  const form = validForm();
  // Renaming a non-pet file or claiming a client-side approval cannot bypass
  // the decision returned by the server's vision request.
  form.set("is_pet_related", "true");
  const result = await actions.generateCaptionSet({}, form);
  assert.equal(result.errorCode, "PET_PHOTO_REQUIRED");
  assert.match(result.error, /Only pet-related photos can be used to generate captions/);
  assert.equal(result.success, undefined);
  assert.equal(result.imageId, undefined);
  assert.deepEqual(events.map(event => event.name), ["reserve_caption_image", "upload", "fail_caption_image", "remove"]);
  assert.equal(events[2].args.p_error_code, "PET_PHOTO_REQUIRED");
  assert.equal(events[3].paths[0], events[1].path);
});

test("an uncertain save response never deletes an image that already committed successfully", async () => {
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    rpc: async (name) => {
      if (name === "reserve_caption_image") return { error: null };
      if (name === "complete_caption_image") return { error: { message: "network response lost" } };
      assert.fail("a ready image should not be marked failed");
    },
    from: () => {
      const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: { status: "ready" }, error: null }) };
      return chain;
    },
    storage: { from: () => ({ upload: async () => ({ error: null }), remove: () => assert.fail("ready image deleted") }) },
  };
  const result = await actionsFor(supabase).generateCaptionSet({}, validForm());
  assert.ok(result.success);
  assert.ok(result.imageId);
});


test("server authorization accompanies every generation RPC and prompt records link to the reserved image", async () => {
  const events = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    rpc: async (name, args) => { events.push({ name, args }); return { error: null }; },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  };
  const actions = actionsFor(supabase, { generateCaptions: async (_image, _tone, _model, imagePath, savePrompt) => {
    await savePrompt(1, { instructions: "vision instructions", input_text: "Describe", image_path: imagePath });
    await savePrompt(2, { instructions: "caption instructions", input_text: '{"description":"A dog sits."}' });
    return { description: "A dog sits.", captions: ["One", "Two", "Three"] };
  } });
  const form = validForm();
  form.set("pipelineSecret", "forged-browser-secret");
  const result = await actions.generateCaptionSet({}, form);
  assert.ok(result.success);
  assert.deepEqual(events.map(e => e.name), ["reserve_caption_image", "record_caption_generation_step", "record_caption_generation_step", "complete_caption_image"]);
  for (const event of events) {
    assert.equal(event.args.p_pipeline_secret, "server-secret-not-browser-input");
    assert.equal(event.args.p_image_id, result.imageId);
  }
  assert.equal(events[1].args.p_stage, 1);
  assert.equal(events[1].args.p_prompt.image_path, `${owner}/${result.imageId}.webp`);
  assert.equal(events[2].args.p_stage, 2);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("missing pipeline authorization fails closed before any generation mutation", async () => {
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
    rpc: () => assert.fail("unconfigured pipeline mutated data"),
  };
  const actions = actionsFor(supabase, { getPipelineSecret: () => null });
  assert.match((await actions.generateCaptionSet({}, validForm())).error, /unavailable/);
});
