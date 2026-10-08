import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as origins from "../lib/supabase/origin.ts";
import * as profiles from "../lib/profile-types.ts";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const origin = "http://localhost:3007";
const owner = "7f518c0f-ad1b-4466-87e2-295ac1a1a20b";
const completeProfile = { id: owner, first_name: "Jennifer", last_name: "Zhang", avatar_path: null };

// Exercise the real route/action logic while keeping OAuth and DB writes local.
function loadModule(path, modules) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => modules[name] ?? require(name),
    URL, File, FormData, Buffer,
  });
  return exports;
}

function authRoutes({ profile = completeProfile, exchangeError = null } = {}) {
  const calls = { exchanges: [], starts: [], profileFilters: [], cookies: 0 };
  const supabase = {
    auth: {
      exchangeCodeForSession: async (code) => {
        calls.exchanges.push(code);
        return { data: { user: exchangeError ? null : { id: owner } }, error: exchangeError };
      },
      signInWithOAuth: async (options) => {
        calls.starts.push(options);
        return { data: { url: "https://accounts.google.com/o/oauth2/v2/auth" }, error: null };
      },
    },
    from: (table) => {
      assert.equal(table, "profiles");
      const chain = {
        select: () => chain,
        eq: (key, value) => { calls.profileFilters.push([key, value]); return chain; },
        maybeSingle: async () => ({ data: profile, error: null }),
      };
      return chain;
    },
  };
  const modules = {
    "@/lib/supabase/origin": origins,
    "@/lib/profile-types": profiles,
    "@/lib/supabase/route": {
      createRouteClient: () => ({
        supabase,
        applyCookies: (response) => {
          calls.cookies += 1;
          response.cookies.set("test-session", "rotated", { httpOnly: true });
          response.headers.set("Cache-Control", "private, no-store");
          return response;
        },
      }),
    },
  };
  return {
    callback: loadModule("../app/auth/callback/route.ts", modules).GET,
    signIn: loadModule("../app/auth/sign-in/route.ts", modules).POST,
    calls,
  };
}

test("completed OAuth returns members to Caption Club and preserves session cookies", async () => {
  const { callback, calls } = authRoutes();
  const response = await callback(new NextRequest(`${origin}/auth/callback?code=valid-code&next=https://evil.example`));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), `${origin}/captions`);
  assert.equal(response.cookies.get("test-session")?.value, "rotated");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(calls.exchanges, ["valid-code"]);
  assert.deepEqual(calls.profileFilters, [["id", owner]]);
  assert.equal(calls.cookies, 1);
});

test("OAuth still sends missing or incomplete names to profile onboarding", async () => {
  for (const profile of [null, { ...completeProfile, first_name: null }, { ...completeProfile, last_name: "   " }]) {
    const { callback } = authRoutes({ profile });
    const response = await callback(new NextRequest(`${origin}/auth/callback?code=valid-code`));
    assert.equal(response.headers.get("location"), `${origin}/profile`);
    assert.equal(response.cookies.get("test-session")?.value, "rotated");
  }
});

test("denied, missing, or failed OAuth cannot enter Caption Club via the callback", async () => {
  for (const [query, exchangeError, expectedExchanges] of [
    ["?error=access_denied&code=ignored", null, 0],
    ["", null, 0],
    ["?code=invalid", { message: "Invalid code" }, 1],
  ]) {
    const { callback, calls } = authRoutes({ exchangeError });
    const response = await callback(new NextRequest(`${origin}/auth/callback${query}`));
    assert.equal(response.headers.get("location"), `${origin}/login?error=callback`);
    assert.equal(calls.exchanges.length, expectedExchanges);
    assert.equal(response.cookies.get("test-session")?.value, "rotated");
  }
});

test("Google sign-in uses the exact clean auth callback, ignoring caller-supplied destinations", async () => {
  const { signIn, calls } = authRoutes();
  const response = await signIn(new NextRequest(`${origin}/auth/sign-in?next=https://evil.example`, {
    method: "POST",
    headers: { origin, "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded" },
    body: "next=https%3A%2F%2Fevil.example",
  }));
  assert.equal(response.status, 303);
  assert.equal(calls.starts.length, 1);
  assert.equal(calls.starts[0].provider, "google");
  assert.equal(calls.starts[0].options.redirectTo, `${origin}/auth/callback`);
  assert.equal(calls.starts[0].options.skipBrowserRedirect, true);
  assert.equal(response.cookies.get("test-session")?.value, "rotated");
});

test("untrusted callback origins and cross-origin sign-ins fail before contacting Auth", async () => {
  const { callback, signIn, calls } = authRoutes();
  assert.equal((await callback(new NextRequest("https://evil.example/auth/callback?code=ignored"))).status, 400);
  assert.equal((await signIn(new NextRequest(`${origin}/auth/sign-in`, {
    method: "POST", headers: { origin: "https://evil.example" },
  }))).status, 403);
  assert.equal((await signIn(new NextRequest("https://evil.example/auth/sign-in", {
    method: "POST", headers: { origin: "https://evil.example" },
  }))).status, 403);
  assert.equal(calls.exchanges.length, 0);
  assert.equal(calls.starts.length, 0);
  assert.equal(calls.cookies, 0);
});

function profileAction(existing, updateError = null) {
  const events = [];
  const chain = {
    select: () => chain,
    eq: () => chain,
    single: async () => events.includes("update")
      ? { data: updateError ? null : { id: owner }, error: updateError }
      : { data: existing, error: null },
    update: () => { events.push("update"); return chain; },
  };
  const { saveProfile } = loadModule("../app/profile/actions.ts", {
    "@/lib/supabase/server": { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: owner } }, error: null }) },
      from: () => chain,
    }) },
    "@/lib/profile-types": profiles,
    "next/cache": { revalidatePath: () => events.push("revalidate") },
    "next/navigation": { redirect: (destination) => { events.push(`redirect:${destination}`); throw new Error(`REDIRECT:${destination}`); } },
  });
  const form = new FormData();
  form.set("first_name", "Jennifer");
  form.set("last_name", "Zhang");
  return { save: () => saveProfile({}, form), events };
}

test("initial name save proceeds to Caption Club only after a successful persisted update", async () => {
  const initial = profileAction({ ...completeProfile, first_name: null, last_name: null });
  await assert.rejects(initial.save(), /REDIRECT:\/captions/);
  assert.deepEqual(initial.events, ["update", "revalidate", "redirect:/captions"]);
  const failed = profileAction({ ...completeProfile, first_name: null }, { message: "Write failed" });
  assert.ok((await failed.save()).error);
  assert.deepEqual(failed.events, ["update"]);
});

test("editing an existing complete profile stays on the profile with save confirmation", async () => {
  const { save, events } = profileAction(completeProfile);
  assert.ok((await save()).success);
  assert.deepEqual(events, ["update", "revalidate"]);
});
