import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("Supabase publishable key is primary with anon-key fallback", () => {
  const env = read("../../packages/database/src/supabase/_env.ts");
  const client = read("../../packages/database/src/supabase/client.ts");
  const turbo = read("../../turbo.json");
  const template = read("../../.env.example");

  assert.match(env, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(env, /return requireEnv\("NEXT_PUBLIC_SUPABASE_ANON_KEY"\)/);
  assert.match(client, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(client, /getPublicSupabaseKey\(\)/);
  assert.match(turbo, /"NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"/);
  assert.match(template, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key/);
});
