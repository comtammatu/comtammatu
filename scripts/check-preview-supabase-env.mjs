#!/usr/bin/env node
import assert from "node:assert/strict";

const SUPABASE_ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_PROJECT_ID",
  "SUPABASE_SERVICE_ROLE_KEY",
];

export function validatePreviewSupabaseEnv(env) {
  if (env.VERCEL_ENV !== "preview") {
    return { status: "skipped", reason: "not a Vercel Preview build" };
  }

  const configuredNames = SUPABASE_ENV_NAMES.filter(
    (name) => typeof env[name] === "string" && env[name].trim() !== "",
  );
  if (configuredNames.length > 0) {
    throw new Error(
      `Vercel Preview is disabled and must not receive Supabase environment variables: ${configuredNames.join(", ")}`,
    );
  }

  throw new Error(
    "Vercel Preview is disabled because no non-production Supabase project is registered",
  );
}

function runSelfTest() {
  assert.equal(
    validatePreviewSupabaseEnv({ VERCEL_ENV: "production" }).status,
    "skipped",
  );
  assert.throws(
    () => validatePreviewSupabaseEnv({ VERCEL_ENV: "preview" }),
    /no non-production Supabase project is registered/,
  );
  assert.throws(
    () =>
      validatePreviewSupabaseEnv({
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      }),
    /must not receive Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL/,
  );

  console.log("[preview-supabase-env] self-test passed (3 cases)");
}

try {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
  } else {
    const result = validatePreviewSupabaseEnv(process.env);
    console.log(`[preview-supabase-env] skipped: ${result.reason}`);
  }
} catch (error) {
  console.error(
    `[preview-supabase-env] FAIL: ${error instanceof Error ? error.message : "unknown validation error"}`,
  );
  process.exit(1);
}
