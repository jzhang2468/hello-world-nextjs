import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedAppOrigin, isSameOriginPost } from "../lib/supabase/origin.ts";

const deployment = "https://hello-world-nextjs-a1b2c3d4-jzhang2468.vercel.app";

test("OAuth can return to this app's deployment, branch, production, and development origins", () => {
  for (const origin of [deployment, "https://hello-world-nextjs-git-assignment-3-auth-jzhang2468.vercel.app", "https://hello-world-nextjs-gray.vercel.app", "http://localhost:3007", "http://127.0.0.1:3007"]) {
    assert.equal(isAllowedAppOrigin(origin), true, origin);
  }
});

test("OAuth rejects external hosts, lookalike hosts, plaintext deployments, and URL payloads", () => {
  for (const origin of ["https://evil.example", `${deployment}.evil.example`, "https://hello-world-nextjs-a1b2-otheraccount.vercel.app", "http://hello-world-nextjs-gray.vercel.app", `${deployment}/auth/callback`, `${deployment}?next=https://evil.example`, "https://user:password@hello-world-nextjs-gray.vercel.app", "null", "javascript:alert(1)"]) {
    assert.equal(isAllowedAppOrigin(origin), false, origin);
  }
});

test("auth mutations require same-origin POST, even when fetch metadata is missing", () => {
  const request = (method, headers = {}) => new Request(`${deployment}/auth/sign-out`, { method, headers });
  assert.equal(isSameOriginPost(request("POST", { origin: deployment, "sec-fetch-site": "same-origin" })), true);
  assert.equal(isSameOriginPost(request("POST", { origin: deployment })), true);
  assert.equal(isSameOriginPost(request("POST")), false);
  assert.equal(isSameOriginPost(request("POST", { origin: "https://evil.example" })), false);
  assert.equal(isSameOriginPost(request("POST", { origin: deployment, "sec-fetch-site": "cross-site" })), false);
  assert.equal(isSameOriginPost(request("GET", { origin: deployment })), false);
});
