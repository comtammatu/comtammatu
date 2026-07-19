#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const REGISTRY_PATH = new URL(
  "../docs/agent/rules/database.md",
  import.meta.url,
);

function parseEnvironmentRegistry(source) {
  const registry =
    source.split("## Environment Registry")[1]?.split("\n## ")[0] ?? "";
  const productionRef = registry.match(
    /^\|\s*`([a-z0-9]{20})`\s*\|\s*\*\*PRODUCTION\*\*/m,
  )?.[1];
  const devRef = registry.match(/matu-greenfield` \(`([a-z0-9]{20})`\)/)?.[1];
  const noTouchRefs = [
    ...registry.matchAll(
      /^\|\s*`([a-z0-9]{20})`\s*\|.*\|\s*Do not touch\.\s*\|$/gm,
    ),
  ].map((match) => match[1]);

  if (!productionRef || !devRef || noTouchRefs.length === 0) {
    throw new Error("could not parse the Environment Registry");
  }

  return { productionRef, devRef, noTouchRefs };
}

function projectRefFromUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL");
  }

  const match = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
  if (
    url.protocol !== "https:" ||
    !match?.[1] ||
    url.username ||
    url.password ||
    url.port ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL must be the canonical HTTPS project URL",
    );
  }

  return match[1];
}

function decodeJwtClaims(name, value) {
  const parts = value.split(".");
  if (parts.length !== 3) return null;

  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new Error(`${name} has a malformed JWT payload`);
  }
}

function verifyKeyBinding(name, value, projectRef, expectedRole) {
  if (!value) return;

  const claims = decodeJwtClaims(name, value);
  if (!claims) {
    throw new Error(`${name} must be a project-verifiable JWT in Preview`);
  }

  if (claims.ref !== projectRef || claims.role !== expectedRole) {
    throw new Error(`${name} does not belong to the selected Supabase project`);
  }
}

export function validatePreviewSupabaseEnv(env, registrySource) {
  if (env.VERCEL_ENV !== "preview") {
    return { status: "skipped", reason: "not a Vercel Preview build" };
  }

  const registry = parseEnvironmentRegistry(registrySource);
  const rawUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const projectId = env.SUPABASE_PROJECT_ID?.trim();
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!rawUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  if (!projectId) throw new Error("SUPABASE_PROJECT_ID is required");
  if (!publishableKey && !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required",
    );
  }
  if (publishableKey && !publishableKey.startsWith("sb_publishable_")) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must use the Supabase publishable-key format",
    );
  }

  const urlRef = projectRefFromUrl(rawUrl);
  if (!PROJECT_REF_PATTERN.test(projectId) || projectId !== urlRef) {
    throw new Error("SUPABASE_PROJECT_ID must match NEXT_PUBLIC_SUPABASE_URL");
  }
  if (urlRef === registry.productionRef) {
    throw new Error("Vercel Preview must not target Supabase Production");
  }
  if (registry.noTouchRefs.includes(urlRef)) {
    throw new Error("Vercel Preview targets a do-not-touch project");
  }
  if (urlRef !== registry.devRef) {
    throw new Error(
      "Vercel Preview must target the registered persistent Cloud DEV project",
    );
  }

  verifyKeyBinding("NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey, urlRef, "anon");
  verifyKeyBinding(
    "SUPABASE_SERVICE_ROLE_KEY",
    serviceRoleKey,
    urlRef,
    "service_role",
  );

  return { status: "passed", projectRef: urlRef };
}

function fixtureJwt(ref, role) {
  return [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(JSON.stringify({ ref, role })).toString("base64url"),
    "fixture-signature",
  ].join(".");
}

function runSelfTest(registrySource) {
  const registry = parseEnvironmentRegistry(registrySource);
  const base = {
    VERCEL_ENV: "preview",
    NEXT_PUBLIC_SUPABASE_URL: `https://${registry.devRef}.supabase.co`,
    SUPABASE_PROJECT_ID: registry.devRef,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: fixtureJwt(registry.devRef, "anon"),
  };

  assert.deepEqual(validatePreviewSupabaseEnv(base, registrySource), {
    status: "passed",
    projectRef: registry.devRef,
  });
  assert.equal(
    validatePreviewSupabaseEnv({ VERCEL_ENV: "production" }, registrySource)
      .status,
    "skipped",
  );

  const rejected = [
    {
      env: {
        ...base,
        NEXT_PUBLIC_SUPABASE_URL: `https://${registry.productionRef}.supabase.co`,
        SUPABASE_PROJECT_ID: registry.productionRef,
      },
      pattern: /must not target Supabase Production/,
    },
    {
      env: {
        ...base,
        NEXT_PUBLIC_SUPABASE_URL: `https://${registry.noTouchRefs[0]}.supabase.co`,
        SUPABASE_PROJECT_ID: registry.noTouchRefs[0],
      },
      pattern: /do-not-touch project/,
    },
    {
      env: {
        ...base,
        NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
        SUPABASE_PROJECT_ID: "abcdefghijklmnopqrst",
      },
      pattern: /registered persistent Cloud DEV/,
    },
    {
      env: { ...base, SUPABASE_PROJECT_ID: registry.productionRef },
      pattern: /must match NEXT_PUBLIC_SUPABASE_URL/,
    },
    {
      env: { ...base, NEXT_PUBLIC_SUPABASE_URL: "not-a-url" },
      pattern: /must be a valid URL/,
    },
    {
      env: { ...base, SUPABASE_PROJECT_ID: "" },
      pattern: /SUPABASE_PROJECT_ID is required/,
    },
    {
      env: {
        ...base,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      },
      pattern: /PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY is required/,
    },
    {
      env: {
        ...base,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: fixtureJwt(
          registry.productionRef,
          "anon",
        ),
      },
      pattern: /does not belong to the selected Supabase project/,
    },
    {
      env: { ...base, SUPABASE_SERVICE_ROLE_KEY: "sb_secret_opaque" },
      pattern: /must be a project-verifiable JWT/,
    },
    {
      env: {
        ...base,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "not-a-publishable-key",
      },
      pattern: /must use the Supabase publishable-key format/,
    },
  ];

  for (const { env, pattern } of rejected) {
    assert.throws(
      () => validatePreviewSupabaseEnv(env, registrySource),
      pattern,
    );
  }

  console.log(
    `[preview-supabase-env] self-test passed (${rejected.length + 2} cases)`,
  );
}

const registrySource = readFileSync(REGISTRY_PATH, "utf8");

try {
  if (process.argv.includes("--self-test")) {
    runSelfTest(registrySource);
  } else {
    const result = validatePreviewSupabaseEnv(process.env, registrySource);
    if (result.status === "passed") {
      console.log(
        `[preview-supabase-env] passed: Vercel Preview targets registered Cloud DEV ${result.projectRef}`,
      );
    } else {
      console.log(`[preview-supabase-env] skipped: ${result.reason}`);
    }
  }
} catch (error) {
  console.error(
    `[preview-supabase-env] FAIL: ${error instanceof Error ? error.message : "unknown validation error"}`,
  );
  process.exit(1);
}
