/**
 * Exercises the real migration in an isolated PostgreSQL WASM database.
 * No live credentials, network calls, or project data are used.
 *
 * Install @electric-sql/pglite in a temporary directory, then run:
 * PGLITE_MODULE=/absolute/path/node_modules/@electric-sql/pglite/dist/index.js \
 *   node scripts/check-caption-rls.mjs
 * If PGlite is installed locally, no environment variable is necessary.
 * Storage/auth schemas below mimic the relevant Supabase tables and roles;
 * actual file MIME/size enforcement remains the Storage API's responsibility.
 */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const root = new URL("../", import.meta.url);
const sql = async (name) => readFile(new URL(`supabase/${name}`, root), "utf8");
const migration = await sql("caption-club.sql");
const db = new PGlite();
const pipelineSecret = randomBytes(32).toString("hex");
const description = "A small dog sitting by a desk.";
const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";
const c = "33333333-3333-4333-8333-333333333333";
const imageA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const imageB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const imageFailed = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const imageMissing = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const checks = [];
const rows = async (query, params = []) => (await db.query(query, params)).rows;
const scalar = async (query, params = []) => Object.values((await rows(query, params))[0])[0];
const passed = (name) => checks.push(name);
async function identity(user, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user || ""]);
  await db.exec(`set role ${role}`);
}
async function denied(query, params = [], code = "42501", message) {
  await assert.rejects(db.query(query, params), (error) =>
    error.code === code && (!message || error.message.includes(message)), query);
}
async function reserve(id, tone = "deadpan") {
  return scalar("select public.reserve_caption_image($1,$2,$3,$4,$5)", [id, tone, "test-model", "test-v2", pipelineSecret]);
}
async function upload(user, id) {
  await db.query("insert into storage.objects(bucket_id,name) values ('caption-images',$1)", [`${user}/${id}.webp`]);
}
async function complete(id, captions = ["A tiny manager.", "The snacks are late.", "Unpaid intern energy."]) {
  await db.query("select public.complete_caption_image($1,$2,$3,$4)", [id, description, captions, pipelineSecret]);
}
function prompt(user, id, stage) {
  return {
    instructions: stage === 1 ? "Describe visible details." : "Write three friendly captions.",
    input_text: stage === 1 ? "Describe this image." : JSON.stringify({ description }),
    model: "test-model",
    max_output_tokens: stage === 1 ? 800 : 650,
    response_format: { type: "json_schema", name: stage === 1 ? "image_description" : "funny_captions", strict: true, schema: { type: "object", properties: {}, additionalProperties: false } },
    ...(stage === 1 ? { image_path: `${user}/${id}.webp` } : {}),
  };
}
async function record(user, id, stage) {
  await db.query("select public.record_caption_generation_step($1,$2,$3,$4)", [id, stage, prompt(user, id, stage), pipelineSecret]);
}

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role supabase_auth_admin;
    create schema auth;
    create schema storage;
    create table auth.users(id uuid primary key);
    grant usage on schema auth to anon, authenticated, supabase_auth_admin;
    grant insert on auth.users to supabase_auth_admin;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table storage.buckets(id text primary key, name text not null,
      public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(bucket_id text, name text, primary key(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated;
    grant select,insert,update,delete on storage.objects to anon,authenticated;
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]
    $$;
  `);
  await db.exec(await sql("schema.sql"));
  await db.exec(await sql("site-settings.sql"));
  await db.exec(await sql("auth-profiles.sql"));
  await db.query("insert into auth.users values ($1),($2),($3)", [a, b, c]);
  await db.exec("update public.products set price=97 where id=1; update public.site_settings set display_font='georgia'");
  await db.query("update public.profiles set first_name='Saved', last_name='Member' where id=$1", [a]);
  await db.exec(`create table public.unlisted_test_table(id integer);
    grant select,insert on public.unlisted_test_table to anon,authenticated;
    create policy broad_legacy_unlisted on public.unlisted_test_table for all to public using(true) with check(true);
    insert into public.unlisted_test_table values(1);`);
  await db.exec(migration);
  await identity(a);
  await denied("select public.reserve_caption_image($1,'deadpan','m','v',$2)", [imageA, pipelineSecret], "42501", "CAPTION_PIPELINE_FORBIDDEN");
  await db.exec("reset role");
  await db.query("insert into private.caption_generation_credentials(id,secret_sha256) values('caption_pipeline',$1)", [createHash("sha256").update(pipelineSecret).digest("hex")]);
  assert.equal(await scalar("select count(*)::int from pg_class t join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and t.relkind in ('r','p') and not t.relrowsecurity"), 0);
  passed("Every public table has RLS, including an unexpected existing table");

  await identity(null, "anon");
  assert.equal(await scalar("select count(*)::int from public.products"), 8);
  assert.equal(await scalar("select display_font from public.site_settings"), "georgia");
  for (const table of ["profiles", "caption_images", "captions", "caption_votes", "caption_generation_steps", "unlisted_test_table"]) {
    await denied(`select * from public.${table}`);
  }
  await denied("insert into public.caption_votes(caption_id,value) values($1,1)", [imageA]);
  await denied("select public.reserve_caption_image($1,'deadpan','m','v',$2)", [imageA, pipelineSecret]);
  await denied("select public.complete_caption_image($1,'description',array['a','b','c'],$2)", [imageA, pipelineSecret]);
  await denied("select public.fail_caption_image($1,'TEST_FAILURE',$2)", [imageA, pipelineSecret]);
  await denied("select public.record_caption_generation_step($1,1,$2,$3)", [imageA, prompt(a, imageA, 1), pipelineSecret]);
  await denied("select * from public.get_top_caption_image_ids(25,0)");
  await denied("select * from public.get_caption_vote_totals(array[]::uuid[])");
  await denied("update public.products set price=1 where id=1");
  await denied("update public.site_settings set display_font='dm-sans'");
  passed("Anonymous visitors can only read public catalogue/settings; no votes, private data, or RPCs");

  await identity(null);
  assert.equal(await scalar("select count(*)::int from public.caption_images"), 0);
  await denied("select public.reserve_caption_image($1,'deadpan','m','v',$2)", [imageA, pipelineSecret], "42501", "CAPTION_UNAUTHENTICATED");
  await denied("select * from public.get_caption_vote_totals(array[]::uuid[])", [], "42501", "CAPTION_UNAUTHENTICATED");
  await denied("select * from public.get_top_caption_image_ids(25,0)", [], "42501", "CAPTION_UNAUTHENTICATED");
  passed("An authenticated role without a user identity cannot call the RPCs");

  await identity(a);
  for (const token of [null, "", "forged-secret-that-is-definitely-long-enough"]) {
    await denied("select public.reserve_caption_image($1,'deadpan','m','v',$2)", [imageA, token], "42501", "CAPTION_PIPELINE_FORBIDDEN");
    await denied("select public.record_caption_generation_step($1,1,$2,$3)", [imageA, prompt(a, imageA, 1), token], "42501", "CAPTION_PIPELINE_FORBIDDEN");
    await denied("select public.complete_caption_image($1,'description',array['a','b','c'],$2)", [imageA, token], "42501", "CAPTION_PIPELINE_FORBIDDEN");
    await denied("select public.fail_caption_image($1,'TEST_FAILURE',$2)", [imageA, token], "42501", "CAPTION_PIPELINE_FORBIDDEN");
  }
  await denied("select public.reserve_caption_image($1,'deadpan','m','v')", [imageA], "42883");
  await denied("select public.complete_caption_image($1,'description',array['a','b','c'])", [imageA], "42883");
  await denied("select public.fail_caption_image($1,'TEST_FAILURE')", [imageA], "42883");
  await denied("select public.record_caption_generation_step($1,1,$2)", [imageA, prompt(a, imageA, 1)], "42883");
  await denied("select * from private.caption_generation_credentials");
  await denied("select private.assert_caption_pipeline($1)", [pipelineSecret]);
  await denied("insert into public.unlisted_test_table values(2)");
  passed("Missing credentials, forged/null secrets, old tokenless RPCs, private helper access, and unknown legacy table access fail closed");
  await denied("select public.reserve_caption_image($1,'unknown','m','v',$2)", [imageA, pipelineSecret], "22023");
  await denied("select public.reserve_caption_image($1,'deadpan',null,'v',$2)", [imageA, pipelineSecret], "22023");
  assert.equal(await reserve(imageA), imageA);
  assert.deepEqual(await rows("select owner_id,image_path,status from public.caption_images"), [
    { owner_id: a, image_path: `${a}/${imageA}.webp`, status: "processing" },
  ]);
  await denied("select public.reserve_caption_image($1,'deadpan','m','v',$2)", [imageMissing, pipelineSecret], "P0001", "CAPTION_RATE_LIMIT");
  await denied("insert into public.caption_images(id,owner_id,image_path,tone,model,prompt_version) values($1,$2,$3,'deadpan','m','v')", [imageMissing, a, `${a}/${imageMissing}.webp`]);
  await denied("update public.caption_images set status='failed' where id=$1", [imageA]);
  await denied("insert into public.captions(image_id,text,position) values($1,'Injected',0)", [imageA]);
  await upload(a, imageA);
  await denied("insert into storage.objects values('caption-images',$1)", [`${a}/${imageMissing}.webp`]);
  assert.equal((await db.query("update storage.objects set name=$1 where name=$2", [`${a}/other.webp`, `${a}/${imageA}.webp`])).affectedRows, 0);
  assert.equal((await db.query("delete from storage.objects where name=$1", [`${a}/${imageA}.webp`])).affectedRows, 0);
  assert.equal(await scalar("select count(*)::int from storage.objects where name=$1", [`${a}/${imageA}.webp`]), 1);
  passed("Reservations derive owner/path; rate limits and grants prevent direct image/caption writes");

  await identity(b);
  assert.equal(await scalar("select count(*)::int from public.caption_images"), 0);
  assert.equal(await scalar("select count(*)::int from storage.objects where bucket_id='caption-images'"), 0);
  await denied("select public.complete_caption_image($1,'A dog',array['a','b','c'],$2)", [imageA, pipelineSecret], "42501", "CAPTION_FORBIDDEN");
  await denied("select public.fail_caption_image($1,'TEST_FAILURE',$2)", [imageA, pipelineSecret], "42501", "CAPTION_FORBIDDEN");
  await denied("insert into storage.objects values('caption-images',$1)", [`${a}/${imageA}.webp`]);
  await reserve(imageB, "chaotic");
  await denied("select public.complete_caption_image($1,'A dog',array['a','b','c'],$2)", [imageB, pipelineSecret], "P0001", "CAPTION_IMAGE_MISSING");
  await upload(b, imageB);
  passed("Cross-user processing images/uploads are hidden; only an owner can complete/fail a reservation");

  await identity(a);
  for (const invalid of [["same", "same", "other"], ["one", "two"], ["one", "two", " "], ["one", "two", "x".repeat(241)], ["one", "two", null]]) {
    await denied("select public.complete_caption_image($1,'A dog',$2,$3)", [imageA, invalid, pipelineSecret], "22023");
  }
  assert.equal(await scalar("select status from public.caption_images where id=$1", [imageA]), "processing");
  await db.exec("reset role");
  assert.equal(await scalar("select count(*)::int from public.captions where image_id=$1", [imageA]), 0);
  await identity(a);
  await denied("select public.complete_caption_image($1,$2,array['a','b','c'],$3)", [imageA, description, pipelineSecret], "P0001", "CAPTION_STEPS_MISSING");
  await denied("select public.record_caption_generation_step($1,2,$2,$3)", [imageA, prompt(a, imageA, 2), pipelineSecret], "P0001", "CAPTION_STEP_ORDER");
  const invalidPrompts = [null, [], {}, { ...prompt(a, imageA, 1), instructions: null },
    { ...prompt(a, imageA, 1), input_text: 42 }, { ...prompt(a, imageA, 1), model: "forged-model" },
    { ...prompt(a, imageA, 1), image_path: `${b}/${imageA}.webp` },
    { ...prompt(a, imageA, 1), max_output_tokens: 0 }, { ...prompt(a, imageA, 1), max_output_tokens: 2.5 },
    { ...prompt(a, imageA, 1), response_format: {} }, { ...prompt(a, imageA, 1), instructions: "x".repeat(12001) },
    { ...prompt(a, imageA, 1), api_key: "should never be stored" },
    { ...prompt(a, imageA, 1), input_text: pipelineSecret },
    { ...prompt(a, imageA, 1), input_text: "data:image/webp;base64,AAAA" },
    { ...prompt(a, imageA, 1), input_text: "sk-example-key-that-must-not-be-saved" },
    { ...prompt(a, imageA, 1), response_format: { ...prompt(a, imageA, 1).response_format, schema: { authorization: "blocked" } } },
  ];
  for (const invalid of invalidPrompts) {
    await denied("select public.record_caption_generation_step($1,1,$2,$3)", [imageA, invalid, pipelineSecret], "22023", "CAPTION_INVALID_PROMPT");
  }
  await record(a, imageA, 1);
  await denied("select public.record_caption_generation_step($1,1,$2,$3)", [imageA, prompt(a, imageA, 1), pipelineSecret], "23505");
  await denied("select public.record_caption_generation_step($1,2,$2,$3)", [imageA, { ...prompt(a, imageA, 2), image_path: `${a}/${imageA}.webp` }, pipelineSecret], "22023");
  await denied("select public.record_caption_generation_step($1,2,$2,$3)", [imageA, { ...prompt(a, imageA, 2), input_text: "not JSON" }, pipelineSecret], "22023");
  await record(a, imageA, 2);
  assert.deepEqual(await rows("select stage,prompt from public.caption_generation_steps where image_id=$1 order by stage", [imageA]), [
    { stage: 1, prompt: prompt(a, imageA, 1) }, { stage: 2, prompt: prompt(a, imageA, 2) },
  ]);
  await denied("insert into public.caption_generation_steps(image_id,stage,prompt) values($1,1,$2)", [imageB, prompt(b, imageB, 1)]);
  await denied("update public.caption_generation_steps set prompt='{}'");
  await denied("delete from public.caption_generation_steps");
  await denied("select public.complete_caption_image($1,'Different description',array['a','b','c'],$2)", [imageA, pipelineSecret], "22023", "CAPTION_DESCRIPTION_MISMATCH");
  passed("Prompt snapshots are exact, bounded, ordered, immutable, reject credentials/binary payloads, and match the published description");
  await complete(imageA);
  const captionsA = await rows("select id,position from public.captions where image_id=$1 order by position", [imageA]);
  assert.deepEqual(captionsA.map((row) => row.position), [0, 1, 2]);
  await denied("select public.complete_caption_image($1,'A dog',array['a','b','c'],$2)", [imageA, pipelineSecret], "P0001", "CAPTION_NOT_PROCESSING");
  await denied("select public.fail_caption_image($1,'TEST_FAILURE',$2)", [imageA, pipelineSecret], "P0001", "CAPTION_NOT_PROCESSING");
  await denied("select public.record_caption_generation_step($1,2,$2,$3)", [imageA, prompt(a, imageA, 2), pipelineSecret], "P0001", "CAPTION_NOT_PROCESSING");
  assert.equal((await db.query("delete from storage.objects where name=$1", [`${a}/${imageA}.webp`])).affectedRows, 0);
  passed("Complete validates all three captions atomically and ready images become immutable");

  await identity(b);
  assert.equal(await scalar("select count(*)::int from public.captions where image_id=$1", [imageA]), 3);
  assert.equal(await scalar("select count(*)::int from storage.objects where bucket_id='caption-images'"), 2);
  assert.equal(await scalar("select count(*)::int from public.caption_generation_steps where image_id=$1", [imageA]), 0);
  await denied("select public.record_caption_generation_step($1,1,$2,$3)", [imageA, prompt(a, imageA, 1), pipelineSecret], "42501", "CAPTION_FORBIDDEN");
  await record(b, imageB, 1);
  await record(b, imageB, 2);
  await complete(imageB);
  await db.query("insert into public.caption_votes(caption_id,value) values($1,1)", [captionsA[0].id]);
  await denied("insert into public.caption_votes(caption_id,value) values($1,-1)", [captionsA[0].id], "23505");
  await denied("insert into public.caption_votes(caption_id,user_id,value) values($1,$2,1)", [captionsA[1].id, a]);
  await denied("insert into public.caption_votes(caption_id,value) values($1,0)", [captionsA[1].id], "23514");
  await db.query("update public.caption_votes set value=-1 where caption_id=$1", [captionsA[0].id]);
  await denied("update public.caption_votes set user_id=$1 where caption_id=$2", [a, captionsA[0].id]);
  await denied("update public.caption_votes set caption_id=$1 where caption_id=$2", [captionsA[1].id, captionsA[0].id]);
  await denied("delete from public.caption_votes");
  await identity(a);
  assert.equal(await scalar("select count(*)::int from public.caption_votes"), 0);
  assert.equal((await db.query("update public.caption_votes set value=1 where caption_id=$1", [captionsA[0].id])).affectedRows, 0);
  await db.query("insert into public.caption_votes(caption_id,value) values($1,1)", [captionsA[0].id]);
  const totals = await rows("select * from public.get_caption_vote_totals($1)", [[captionsA[0].id]]);
  assert.deepEqual(totals, [{ caption_id: captionsA[0].id, upvotes: 1, downvotes: 1 }]);
  assert.equal(await scalar("select count(*)::int from public.caption_votes"), 1);
  await denied("select * from public.get_caption_vote_totals($1)", [Array(151).fill(captionsA[0].id)], "22023");
  passed("Authenticated votes insert rows, stay unique/private, permit value-only revision, and expose only aggregate totals");

  assert.deepEqual(await rows("select * from public.get_top_caption_image_ids(25,0)"), [{ image_id: imageB }, { image_id: imageA }]);
  await identity(b);
  await db.query("insert into public.caption_votes(caption_id,value) values($1,1)", [captionsA[1].id]);
  assert.deepEqual(await rows("select * from public.get_top_caption_image_ids(1,0)"), [{ image_id: imageA }]);
  assert.deepEqual(await rows("select * from public.get_top_caption_image_ids(1,1)"), [{ image_id: imageB }]);
  for (const [limit, offset] of [[0, 0], [26, 0], [null, 0], [1, -1], [1, 10001], [1, null]]) {
    await denied("select * from public.get_top_caption_image_ids($1,$2)", [limit, offset], "22023");
  }
  await db.exec("reset role");
  await db.query("delete from public.caption_votes where caption_id=$1 and user_id=$2", [captionsA[1].id, b]);
  passed("Top photo IDs use aggregate net votes, stable recency ties, bounded pagination, and verified identities");

  await db.exec("reset role");
  await db.query("update public.caption_images set created_at=now()-interval '1 minute' where owner_id=$1", [a]);
  await identity(a);
  await reserve(imageFailed);
  await upload(a, imageFailed);
  await denied("select public.fail_caption_image($1,'possibly secret exception text',$2)", [imageFailed, pipelineSecret], "22023");
  await db.query("select public.fail_caption_image($1,'MODEL_FAILED',$2)", [imageFailed, pipelineSecret]);
  assert.equal((await db.query("delete from storage.objects where name=$1", [`${a}/${imageFailed}.webp`])).affectedRows, 1);
  await denied("insert into storage.objects values('caption-images',$1)", [`${a}/${imageFailed}.webp`]);
  await db.exec("reset role");
  await db.query("insert into public.captions(image_id,text,position) values($1,'Deliberate corrupt fixture',0)", [imageFailed]);
  const failedCaption = await scalar("select id from public.captions where image_id=$1", [imageFailed]);
  await identity(b);
  assert.equal(await scalar("select count(*)::int from public.caption_images where id=$1", [imageFailed]), 0);
  assert.equal(await scalar("select count(*)::int from public.captions where image_id=$1", [imageFailed]), 0);
  await denied("insert into public.caption_votes(caption_id,value) values($1,1)", [failedCaption]);
  assert.deepEqual(await rows("select * from public.get_caption_vote_totals($1)", [[failedCaption]]), []);
  passed("Processing images cannot be deleted; failed attempts allow owner cleanup but stay private and cannot receive votes");

  // Rate-limit time travel is test-only superuser fixture setup; clients have
  // no privilege to alter created_at. Check all ten reservations are counted.
  await identity(c);
  for (let index = 0; index < 10; index++) {
    const id = `cccccccc-cccc-4ccc-8ccc-${String(index).padStart(12, "0")}`;
    await reserve(id);
    await db.exec("reset role");
    await db.query("update public.caption_images set created_at=now()-interval '1 minute' where owner_id=$1", [c]);
    await identity(c);
  }
  await denied("select public.reserve_caption_image($1,'deadpan','m','v',$2)", [imageMissing, pipelineSecret], "P0001", "CAPTION_DAILY_LIMIT");
  await db.exec("reset role");
  await db.query("update public.caption_images set created_at=now()-interval '25 hours' where owner_id=$1", [c]);
  await identity(c);
  await reserve(imageMissing);
  passed("Ten-per-day quota includes attempts, rejects the eleventh, and expires after 24 hours");

  // Deliberately add broad legacy policies: restrictive guards must still win.
  await db.exec("reset role");
  await db.exec(`
    create policy broad_legacy_storage on storage.objects for all to public using(true) with check(true);
    create policy broad_legacy_profiles on public.profiles for all to public using(true) with check(true);
    create policy broad_legacy_images on public.caption_images for all to public using(true) with check(true);
    create policy broad_legacy_captions on public.captions for all to public using(true) with check(true);
    create policy broad_legacy_votes on public.caption_votes for all to public using(true) with check(true);
    create policy broad_legacy_steps on public.caption_generation_steps for all to public using(true) with check(true);
    grant insert,update,delete on public.caption_generation_steps to authenticated;
    grant select,insert on public.unlisted_test_table to anon,authenticated;
  `);
  await identity(b);
  assert.deepEqual(await rows("select id from public.profiles"), [{ id: b }]);
  assert.equal(await scalar("select count(*)::int from public.caption_images where id=$1", [imageFailed]), 0);
  assert.equal(await scalar("select count(*)::int from public.captions where image_id=$1", [imageFailed]), 0);
  assert.equal(await scalar("select count(*)::int from public.caption_votes where user_id=$1", [a]), 0);
  assert.equal(await scalar("select count(*)::int from public.caption_generation_steps where image_id=$1", [imageA]), 0);
  await denied("update public.caption_generation_steps set prompt='{}'");
  assert.equal((await db.query("delete from public.caption_generation_steps")).affectedRows, 0);
  assert.equal(await scalar("select count(*)::int from public.unlisted_test_table"), 0);
  await denied("insert into public.unlisted_test_table values(2)");
  await denied("insert into public.caption_votes(caption_id,user_id,value) values($1,$2,1)", [captionsA[1].id, a]);
  await denied("insert into storage.objects values('caption-images',$1)", [`${a}/${imageFailed}.webp`]);
  await denied("insert into storage.objects values('avatars',$1)", [`${b}/invalid-name.webp`]);
  assert.equal((await db.query("update storage.objects set name='tampered.webp' where bucket_id='caption-images'")).affectedRows, 0);
  assert.equal((await db.query("delete from storage.objects where bucket_id='caption-images'")).affectedRows, 0);
  await identity(null, "anon");
  await denied("select * from storage.objects where bucket_id='caption-images'");
  passed("Restrictive guards survive broad legacy policies across profiles, images, captions, votes, and storage");

  await db.exec("reset role");
  const legacyImage = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  await db.query("insert into public.caption_images(id,owner_id,image_path,description,status,tone,model,prompt_version) values($1,$2,$3,'Saved before prompt snapshots','ready','deadpan','legacy-model','legacy-version')", [legacyImage, a, `${a}/${legacyImage}.webp`]);
  await db.query("insert into storage.objects(bucket_id,name) values('caption-images',$1)", [`${a}/${legacyImage}.webp`]);
  await db.query("insert into public.captions(image_id,text,position) values($1,'Original one',0),($1,'Original two',1),($1,'Original three',2)", [legacyImage]);
  const legacyCaption = await scalar("select id from public.captions where image_id=$1 and position=0", [legacyImage]);
  await db.query("insert into public.caption_votes(caption_id,user_id,value) values($1,$2,1)", [legacyCaption, c]);
  await db.exec(migration);
  assert.equal(await scalar("select price::int from public.products where id=1"), 97);
  assert.equal(await scalar("select display_font from public.site_settings"), "georgia");
  assert.equal(await scalar("select first_name from public.profiles where id=$1", [a]), "Saved");
  assert.equal(await scalar("select count(*)::int from public.caption_votes"), 3);
  assert.equal(await scalar("select count(*)::int from public.captions where image_id=$1", [imageA]), 3);
  assert.deepEqual(await rows("select public,file_size_limit::int,allowed_mime_types from storage.buckets where id='caption-images'"), [
    { public: false, file_size_limit: 3145728, allowed_mime_types: ["image/webp"] },
  ]);
  assert.deepEqual(await rows("select status,description,model,prompt_version from public.caption_images where id=$1", [legacyImage]), [{ status: "ready", description: "Saved before prompt snapshots", model: "legacy-model", prompt_version: "legacy-version" }]);
  assert.equal(await scalar("select count(*)::int from public.captions where image_id=$1", [legacyImage]), 3);
  assert.equal(await scalar("select count(*)::int from public.caption_votes where caption_id=$1", [legacyCaption]), 1);
  assert.equal(await scalar("select count(*)::int from public.caption_generation_steps where image_id=$1", [legacyImage]), 0);
  assert.equal(await scalar("select count(*)::int from public.caption_generation_steps"), 4);
  assert.equal(await scalar("select count(*)::int from private.caption_generation_credentials"), 1);
  await db.exec(await sql("verify-caption-club.sql"));
  passed("Migration and verification SQL rerun cleanly without resetting prices, font, names, captions, votes, or private bucket settings");

  console.log(JSON.stringify({ result: "passed", engine: "PGlite PostgreSQL with mocked Supabase auth/storage roles", migration: fileURLToPath(new URL("supabase/caption-club.sql", root)), checks }, null, 2));
} finally {
  await db.close();
}
