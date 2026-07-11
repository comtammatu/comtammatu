#!/usr/bin/env node
// Bring up a from-empty Supabase Local stack for the e2e smoke and wire the app
// env to it. Applies the active migration chain (baseline + forward) + the
// dev-tenant + QA seeds (cashier.datdo / chef.datdo, password Test1234!), then
// writes the env files Playwright and `next dev` need. Used by the CI e2e-smoke
// job; runnable locally.
//
// Non-essential services (studio/inbucket/analytics/edge runtime) are disabled —
// the POS->payment->KDS smoke does not use them (the repo has no edge functions,
// and the edge runtime boots by fetching from jsr.io, a network flake source),
// and it keeps startup fast and free of port contention with any other local
// Supabase project. Storage stays enabled: the fold migration provisions storage
// buckets + policies, which need the storage schema the storage service creates.
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = process.cwd();
const PROJECT_ID = "comtammatu-e2e";
const WORKDIR = process.env["E2E_SUPABASE_WORKDIR"] || "/tmp/comtammatu-e2e-stack";
const API_PORT = Number(process.env["E2E_API_PORT"] || 55421);
const DB_PORT = Number(process.env["E2E_DB_PORT"] || 55432);
const SHADOW_PORT = Number(process.env["E2E_SHADOW_PORT"] || 55430);

// Prefer a CLI on PATH (fast locally); fall back to `pnpm dlx supabase` (CI).
function supabase(args, { timeoutMs = 600_000 } = {}) {
  let r = spawnSync("supabase", args, { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs });
  if (r.error && r.error.code === "ENOENT") {
    r = spawnSync("pnpm", ["dlx", "supabase", ...args], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: timeoutMs });
  }
  return r;
}

function writeScratch() {
  rmSync(WORKDIR, { recursive: true, force: true });
  mkdirSync(join(WORKDIR, "supabase", "migrations"), { recursive: true });
  mkdirSync(join(WORKDIR, "supabase", "_local-dev"), { recursive: true });
  // Full active chain (baseline + forward migrations), same as a fresh-env
  // install: the seeds track post-forward schema semantics, so baseline-only
  // rejects them (e.g. WF10 central-site NULL branch claims).
  for (const f of readdirSync(join(REPO, "supabase/migrations")).sort()) {
    if (/^\d{14}_.+\.sql$/.test(f)) {
      cpSync(join(REPO, "supabase/migrations", f), join(WORKDIR, "supabase/migrations", f));
    }
  }
  cpSync(join(REPO, "supabase/_local-dev/dev-tenant-seed.sql"), join(WORKDIR, "supabase/_local-dev/dev-tenant-seed.sql"));
  cpSync(join(REPO, "supabase/seed.sql"), join(WORKDIR, "supabase/seed.sql"));
  writeFileSync(
    join(WORKDIR, "supabase", "config.toml"),
    `project_id = "${PROJECT_ID}"
[api]
port = ${API_PORT}
[db]
port = ${DB_PORT}
shadow_port = ${SHADOW_PORT}
major_version = 17
[db.seed]
enabled = true
sql_paths = ["./_local-dev/dev-tenant-seed.sql", "./seed.sql"]
[studio]
enabled = false
[inbucket]
enabled = false
[analytics]
enabled = false
[edge_runtime]
enabled = false
[auth]
enabled = true
site_url = "http://localhost:3000"
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
`,
  );
}

function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((l) => l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

function startStack() {
  writeScratch();
  process.stdout.write("Starting Supabase Local for e2e (baseline + seeds)...\n");
  const start = supabase(["start", "--workdir", WORKDIR]);
  process.stdout.write((start.stdout || "") + (start.stderr || ""));
  return start.status === 0;
}

function main() {
  if (!startStack()) {
    // One retry with full teardown: shared CI runners intermittently hit
    // Docker Hub pull rate limits mid-start and leave a half-started stack.
    process.stderr.write("\nsupabase start failed — tearing down and retrying once in 90s\n");
    supabase(["stop", "--workdir", WORKDIR, "--no-backup"], { timeoutMs: 120_000 });
    spawnSync("sleep", ["90"]);
    if (!startStack()) {
      process.stderr.write("\nsupabase start failed\n");
      process.exit(1);
    }
  }

  const status = supabase(["status", "--workdir", WORKDIR, "-o", "env"], { timeoutMs: 60_000 });
  const env = parseEnv(status.stdout || "");
  const apiUrl = env["API_URL"];
  const anon = env["ANON_KEY"];
  const service = env["SERVICE_ROLE_KEY"];
  if (!apiUrl || !anon || !service) {
    process.stderr.write(`missing keys from supabase status (API_URL/ANON_KEY/SERVICE_ROLE_KEY)\n${status.stdout}\n`);
    process.exit(1);
  }

  // Playwright + the test helper read .env.test.local.
  const testEnv = `E2E_BASE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=${apiUrl}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}
SUPABASE_SERVICE_ROLE_KEY=${service}
E2E_CASHIER_EMAIL=cashier.datdo@comtammatu.vn
E2E_CASHIER_PASSWORD=Test1234!
E2E_CHEF_EMAIL=chef.datdo@comtammatu.vn
E2E_CHEF_PASSWORD=Test1234!
E2E_INVENTORY_MANAGER_EMAIL=manager.datdo@comtammatu.vn
E2E_INVENTORY_MANAGER_PASSWORD=Test1234!
`;
  writeFileSync(resolve(REPO, "apps/web/.env.test.local"), testEnv);

  // `next dev` (the Playwright webServer) reads ../../.env.local then .env.local.
  // Point them at the same local stack so the app talks to the e2e database.
  // POS_NETWORK_GATE=off disables the production POS/KDS network perimeter
  // (proxy.ts): the smoke runs from loopback, which getClientIp() correctly
  // rejects as private, so without this the prod build 307s POS to
  // /access-denied (untrusted-network). This is the documented kill-switch for
  // running POS off the branch wifi. Set in .env.local so it is inlined at
  // `next build` (edge middleware) and present for `next start`.
  const appEnv = `NEXT_PUBLIC_SUPABASE_URL=${apiUrl}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}
SUPABASE_SERVICE_ROLE_KEY=${service}
POS_NETWORK_GATE=off
`;
  writeFileSync(resolve(REPO, ".env.local"), appEnv);
  writeFileSync(resolve(REPO, "apps/web/.env.local"), appEnv);

  process.stdout.write(`\nSupabase e2e stack ready at ${apiUrl}\nWrote apps/web/.env.test.local + .env.local\n`);
}

main();
