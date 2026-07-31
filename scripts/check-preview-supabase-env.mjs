#!/usr/bin/env node
import assert from "node:assert/strict";

const PRODUCTION_VERCEL_PROJECT_ID = "prj_OGyJLaxEcceuckDoOUWth60FasXC";
const PRODUCTION_SUPABASE_REF = "enloyfnuerqgaqderbwb";
const SUPABASE_ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_PROJECT_ID",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function validateProductionSupabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "Vercel Production requires a valid NEXT_PUBLIC_SUPABASE_URL",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== `${PRODUCTION_SUPABASE_REF}.supabase.co` ||
    url.port ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `Vercel Production must target Supabase ${PRODUCTION_SUPABASE_REF}`,
    );
  }
}

export function validateVercelSupabaseEnv(env) {
  if (env.VERCEL_ENV === "preview") {
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

  if (env.VERCEL_ENV !== "production") {
    return { status: "skipped", reason: "not a Vercel deployment build" };
  }
  if (env.VERCEL_PROJECT_ID !== PRODUCTION_VERCEL_PROJECT_ID) {
    throw new Error(
      `Vercel Production requires project ${PRODUCTION_VERCEL_PROJECT_ID}`,
    );
  }

  validateProductionSupabaseUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const declaredRef = env.SUPABASE_PROJECT_ID?.trim();
  if (declaredRef && declaredRef !== PRODUCTION_SUPABASE_REF) {
    throw new Error(
      `SUPABASE_PROJECT_ID must match Production ${PRODUCTION_SUPABASE_REF}`,
    );
  }

  return {
    status: "ok",
    reason: "registered Production target",
  };
}

function runSelfTest() {
  assert.equal(validateVercelSupabaseEnv({}).status, "skipped");
  assert.equal(
    validateVercelSupabaseEnv({
      VERCEL_ENV: "production",
      VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
      NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co`,
    }).status,
    "ok",
  );
  assert.throws(
    () => validateVercelSupabaseEnv({ VERCEL_ENV: "preview" }),
    /no non-production Supabase project is registered/,
  );
  assert.throws(
    () =>
      validateVercelSupabaseEnv({
        VERCEL_ENV: "preview",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      }),
    /must not receive Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL/,
  );
  assert.throws(
    () =>
      validateVercelSupabaseEnv({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co`,
      }),
    /requires project/,
  );
  assert.throws(
    () =>
      validateVercelSupabaseEnv({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_ID: "prj_unregistered000000000000000000",
        NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co`,
      }),
    /requires project/,
  );
  assert.throws(
    () =>
      validateVercelSupabaseEnv({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
        NEXT_PUBLIC_SUPABASE_URL: "https://unregistered000000.supabase.co",
      }),
    /must target Supabase/,
  );
  assert.throws(
    () =>
      validateVercelSupabaseEnv({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
      }),
    /valid NEXT_PUBLIC_SUPABASE_URL/,
  );
  assert.throws(
    () =>
      validateVercelSupabaseEnv({
        VERCEL_ENV: "production",
        VERCEL_PROJECT_ID: PRODUCTION_VERCEL_PROJECT_ID,
        NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co`,
        SUPABASE_PROJECT_ID: "unregistered000000",
      }),
    /SUPABASE_PROJECT_ID must match Production/,
  );

  console.log("[vercel-supabase-env] self-test passed (9 cases)");
}

try {
  if (process.argv.includes("--self-test")) {
    runSelfTest();
  } else {
    const result = validateVercelSupabaseEnv(process.env);
    console.log(`[vercel-supabase-env] ${result.status}: ${result.reason}`);
  }
} catch (error) {
  console.error(
    `[vercel-supabase-env] FAIL: ${error instanceof Error ? error.message : "unknown validation error"}`,
  );
  process.exit(1);
}
