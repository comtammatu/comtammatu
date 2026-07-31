#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const PRODUCTION_PROJECT_REF = "enloyfnuerqgaqderbwb";
const SESSION_POOLER_HOST = "aws-0-ap-southeast-1.pooler.supabase.com";
const SESSION_POOLER_PORT = "5432";
const EXPECTED_USERNAME = `postgres.${PRODUCTION_PROJECT_REF}`;

function validateDbUrl(value) {
  const url = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== SESSION_POOLER_HOST ||
    url.port !== SESSION_POOLER_PORT ||
    url.username !== EXPECTED_USERNAME ||
    url.pathname !== "/postgres" ||
    !url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `SUPABASE_DB_URL must be the registered Production Session Pooler URL for ${PRODUCTION_PROJECT_REF}`,
    );
  }
  return url;
}

function selfTest() {
  validateDbUrl(
    `postgresql://${EXPECTED_USERNAME}:test-password@${SESSION_POOLER_HOST}:${SESSION_POOLER_PORT}/postgres`,
  );
  const rejected = [
    `postgresql://postgres.wrongprojectref0000:test-password@${SESSION_POOLER_HOST}:${SESSION_POOLER_PORT}/postgres`,
    `postgresql://${EXPECTED_USERNAME}:test-password@db.${PRODUCTION_PROJECT_REF}.supabase.co:${SESSION_POOLER_PORT}/postgres`,
    `postgresql://${EXPECTED_USERNAME}:test-password@${SESSION_POOLER_HOST}:6543/postgres`,
    `postgresql://${EXPECTED_USERNAME}@${SESSION_POOLER_HOST}:${SESSION_POOLER_PORT}/postgres`,
    `postgresql://${EXPECTED_USERNAME}:test-password@${SESSION_POOLER_HOST}:${SESSION_POOLER_PORT}/postgres?host=example.com`,
  ];
  for (const value of rejected) {
    try {
      validateDbUrl(value);
      throw new Error(`unsafe URL accepted: ${value}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("unsafe URL accepted")) {
        throw error;
      }
    }
  }
  process.stdout.write("Production push guard self-test passed.\n");
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--self-test") {
    selfTest();
    return;
  }
  if (
    args.length !== 1 ||
    !["--dry-run", "--apply"].includes(args[0] ?? "")
  ) {
    throw new Error(
      "Usage: node scripts/supabase-production-push.mjs --dry-run|--apply",
    );
  }

  const env = parseEnv(readFileSync(".env.local", "utf8"));
  const url = validateDbUrl(env["SUPABASE_DB_URL"] ?? "");
  const password = env["SUPABASE_DB_PASSWORD"];
  if (password && password !== decodeURIComponent(url.password)) {
    throw new Error(
      "SUPABASE_DB_PASSWORD does not match the password embedded in SUPABASE_DB_URL",
    );
  }

  const dryRun = args[0] === "--dry-run";
  process.stdout.write(
    `${dryRun ? "Dry-running" : "Applying"} migrations to Production ${PRODUCTION_PROJECT_REF} via Session Pooler.\n`,
  );
  const result = spawnSync(
    "corepack",
    [
      "pnpm",
      "exec",
      "supabase",
      "db",
      "push",
      ...(dryRun ? ["--dry-run"] : []),
      "--db-url",
      url.href,
      "--yes",
    ],
    {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: process.platform === "win32",
      timeout: 600_000,
    },
  );
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
