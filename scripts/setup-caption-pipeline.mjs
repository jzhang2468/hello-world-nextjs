import { randomBytes, createHash } from "node:crypto";
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { parseEnv } from "node:util";

// Run from the repository root. Values never go to stdout or tracked files.
const envPath = ".env.local";
const sqlPath = ".env.caption-pipeline-setup.sql";
let env = readFileSync(envPath, "utf8");
const assignments = env.match(/^\s*(?:export\s+)?CAPTION_PIPELINE_SECRET\s*=/gm) ?? [];
if (assignments.length > 1) {
  throw new Error("Remove duplicate CAPTION_PIPELINE_SECRET assignments before setup.");
}
let secret = parseEnv(env).CAPTION_PIPELINE_SECRET;
if (secret && !/^[a-f0-9]{64}$/.test(secret)) {
  throw new Error("The existing pipeline secret must be 64 lowercase hex characters.");
}
if (!secret) {
  secret = randomBytes(32).toString("hex");
  env = env.replace(/^\s*(?:export\s+)?CAPTION_PIPELINE_SECRET\s*=.*\n?/m, "");
  writeFileSync(envPath, `${env.trimEnd()}\nCAPTION_PIPELINE_SECRET=${secret}\n`, { mode: 0o600 });
}
chmodSync(envPath, 0o600);
const digest = createHash("sha256").update(secret).digest("hex");
writeFileSync(sqlPath, `-- Run after supabase/caption-club.sql. Contains a verifier, never the secret.
insert into private.caption_generation_credentials (id, secret_sha256)
values ('caption_pipeline', '${digest}')
on conflict (id) do update set secret_sha256 = excluded.secret_sha256;
`, { mode: 0o600 });
chmodSync(sqlPath, 0o600);
console.log(`Pipeline secret ready in ignored ${envPath}; database setup written to ignored ${sqlPath}.`);
