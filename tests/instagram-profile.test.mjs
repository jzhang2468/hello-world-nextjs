import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as profile from "../lib/instagram-profile.ts";

const { normalizeInstagramUsername, getInstagramUsername, INSTAGRAM_USERNAME_KEY } = profile;

test("handles and copied profile links save the same canonical username", () => {
  for (const input of [" Biscuit.Pet_01 ", "@BISCUIT.pet_01", "instagram.com/Biscuit.Pet_01", "https://www.instagram.com/Biscuit.Pet_01/?igsh=abc#bio"]) {
    assert.equal(normalizeInstagramUsername(input), "biscuit.pet_01");
  }
  assert.equal(normalizeInstagramUsername("a"), "a");
  assert.equal(normalizeInstagramUsername("a".repeat(30)), "a".repeat(30));
  assert.equal(getInstagramUsername({ [INSTAGRAM_USERNAME_KEY]: "@OLD.handle" }), "old.handle");
  assert.equal(getInstagramUsername({ username: "provider_claim" }), null);
  assert.equal(getInstagramUsername(undefined), null);
});

test("rejects malformed handles, non-profile Instagram destinations, and foreign or unsafe links", () => {
  for (const input of [null, {}, "", "@", "a".repeat(31), ".pet", "pet.", "a..b", "@@pet", "pet name", "pet/bio", "https://instagram.com/",
    "https://www.instagram.com/accounts/edit/", "https://instagram.com/Reels/", "https://instagram.com/p/abc", "https://instagram.com/stories",
    "https://instagram.com/%2e%2e", "https://instagram.com/a/../pet", "https://other.example/pet", "https://instagram.com@other.example/pet",
    "https://instagram.com.evil.example/pet", "//instagram.com/pet", "javascript:alert(1)", "http://instagram.com/pet", "https://www.instagram.com:8443/pet"]) {
    assert.equal(normalizeInstagramUsername(input), null, String(input));
  }
  assert.equal(getInstagramUsername({ [INSTAGRAM_USERNAME_KEY]: "https://other.example" }), null);
});

const source = readFileSync(new URL("../app/captions/instagram-profile-actions.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function actionFor(auth) {
  const revalidated = [];
  const modules = {
    "@/lib/instagram-profile": profile,
    "@/lib/supabase/server": { createClient: async () => ({ auth }) },
    "next/cache": { revalidatePath: (path) => revalidated.push(path) },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: (name) => modules[name] });
  return { save: exports.saveInstagramProfile, revalidated };
}

test("updating a member's Instagram handle writes only that preference for the authenticated account", async () => {
  const member = { id: "member-a", user_metadata: { avatar_url: "original-avatar" } };
  const other = { id: "member-b", user_metadata: { [INSTAGRAM_USERNAME_KEY]: "another.creator" } };
  const { save, revalidated } = actionFor({
    getUser: async () => ({ data: { user: member } }),
    updateUser: async (change) => {
      assert.deepEqual(Object.keys(change), ["data"]);
      assert.deepEqual(Object.keys(change.data), [INSTAGRAM_USERNAME_KEY]);
      Object.assign(member.user_metadata, change.data);
      return { data: { user: member }, error: null };
    },
  });
  assert.equal((await save("@My.Pet")).username, "my.pet");
  assert.equal((await save("https://www.instagram.com/My.New.Pet/")).username, "my.new.pet");
  assert.deepEqual(member.user_metadata, { avatar_url: "original-avatar", [INSTAGRAM_USERNAME_KEY]: "my.new.pet" });
  assert.equal(getInstagramUsername(other.user_metadata), "another.creator");
  assert.deepEqual(revalidated, ["/profile", "/profile"]);
});

test("invalid, signed-out, and failed saves never return a successful update", async () => {
  let reads = 0;
  const signedOut = actionFor({ getUser: async () => { reads++; return { data: { user: null } }; } });
  assert.match((await signedOut.save("https://other.example/pet")).error, /username/);
  assert.equal(reads, 0);
  assert.match((await signedOut.save("@my.pet")).error, /Sign in/);
  assert.deepEqual(signedOut.revalidated, []);
  const denied = actionFor({
    getUser: async () => ({ data: { user: { id: "member-a" } } }),
    updateUser: async () => ({ data: { user: null }, error: new Error("Update failed") }),
  });
  assert.match((await denied.save("@my.pet")).error, /try again/);
  assert.deepEqual(denied.revalidated, []);
});
