#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";

const PRODUCTION_PROJECT_REF = "enloyfnuerqgaqderbwb";
const SESSION_POOLER_HOST = "aws-0-ap-southeast-1.pooler.supabase.com";
const SESSION_POOLER_PORT = "5432";
const EXPECTED_USERNAME = `postgres.${PRODUCTION_PROJECT_REF}`;
const MIGRATION_MANIFEST = "supabase/migration-lineage.json";
const ACTIVE_MIGRATIONS = "supabase/migrations";
const ARCHIVED_MIGRATIONS = "supabase/migration-archive";
const VERSIONED_SQL = /^(\d{14})_.+\.sql$/;

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

function selectProductionMigrations(
  activeFiles,
  archivedFiles,
  baselineVersion,
  remoteVersions,
) {
  const baselineFile = `${baselineVersion}_baseline.sql`;
  if (activeFiles.filter((file) => file === baselineFile).length !== 1) {
    throw new Error(`Expected exactly one active baseline ${baselineFile}`);
  }

  const activeForwards = activeFiles.filter(
    (file) => file.match(VERSIONED_SQL)?.[1] > baselineVersion,
  );
  const selected = [];
  for (const version of remoteVersions) {
    const source = version <= baselineVersion ? archivedFiles : activeForwards;
    const matches = source.filter((file) => file.startsWith(`${version}_`));
    if (matches.length !== 1) {
      throw new Error(
        `Expected exactly one local migration for applied Production version ${version}`,
      );
    }
    if (version <= baselineVersion) {
      selected.push([ARCHIVED_MIGRATIONS, matches[0]]);
    }
  }
  selected.push(...activeForwards.map((file) => [ACTIVE_MIGRATIONS, file]));

  const versions = new Set();
  for (const [source, file] of selected) {
    const version = file.match(VERSIONED_SQL)?.[1];
    if (!version)
      throw new Error(`Invalid migration filename: ${source}/${file}`);
    if (versions.has(version)) {
      throw new Error(
        `Duplicate migration version in Production projection: ${version}`,
      );
    }
    versions.add(version);
  }
  return selected;
}

function parseRemoteMigrationVersions(output) {
  const { migrations } = JSON.parse(output);
  const versions = new Set(
    migrations
      ?.map(({ remote }) => remote)
      .filter((version) => /^\d{14}$/.test(version)),
  );
  if (versions.size === 0) {
    throw new Error("Could not read the Production migration ledger");
  }
  return [...versions];
}

function listRemoteMigrationVersions(projectRoot, url) {
  const result = spawnSync(
    "corepack",
    [
      "pnpm",
      "exec",
      "supabase",
      "migration",
      "list",
      "--db-url",
      url.href,
      // CLI 2.10x defaults to a text table; the parser below expects the JSON
      // shape `{ migrations: [{ remote }] }`.
      "--output-format",
      "json",
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      shell: process.platform === "win32",
      timeout: 600_000,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    throw new Error("Could not list the Production migration ledger");
  }
  return parseRemoteMigrationVersions(result.stdout);
}

function createProductionWorkdir(projectRoot, remoteVersions) {
  const { baselineVersion } = JSON.parse(
    readFileSync(join(projectRoot, MIGRATION_MANIFEST), "utf8"),
  );
  if (!/^\d{14}$/.test(baselineVersion ?? "")) {
    throw new Error(`${MIGRATION_MANIFEST}: baselineVersion must be 14 digits`);
  }
  const activeFiles = readdirSync(join(projectRoot, ACTIVE_MIGRATIONS));
  const archivedFiles = readdirSync(join(projectRoot, ARCHIVED_MIGRATIONS));
  const migrations = selectProductionMigrations(
    activeFiles,
    archivedFiles,
    baselineVersion,
    remoteVersions,
  );
  const workdir = mkdtempSync(join(tmpdir(), "ctm-production-push-"));
  const supabaseDir = join(workdir, "supabase");
  const migrationsDir = join(supabaseDir, "migrations");
  mkdirSync(migrationsDir, { recursive: true });
  for (const [source, file] of migrations) {
    copyFileSync(join(projectRoot, source, file), join(migrationsDir, file));
  }
  return workdir;
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
      if (
        error instanceof Error &&
        error.message.startsWith("unsafe URL accepted")
      ) {
        throw error;
      }
    }
  }
  const selected = selectProductionMigrations(
    ["20260101000000_baseline.sql", "20260101000001_forward.sql"],
    ["20251231235959_history.sql", "20260101000000_cutoff.sql"],
    "20260101000000",
    ["20251231235959", "20260101000000"],
  );
  if (
    selected.map(([, file]) => file).join(",") !==
    "20251231235959_history.sql,20260101000000_cutoff.sql,20260101000001_forward.sql"
  ) {
    throw new Error("Production migration projection selected the wrong files");
  }
  const parsed = parseRemoteMigrationVersions(
    JSON.stringify({
      migrations: [{ local: "", remote: "20251231235959" }],
    }),
  );
  if (parsed.join(",") !== "20251231235959") {
    throw new Error("Production migration ledger parser failed");
  }
  process.stdout.write("Production push guard self-test passed.\n");
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--self-test") {
    selfTest();
    return;
  }
  if (args.length !== 1 || !["--dry-run", "--apply"].includes(args[0] ?? "")) {
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
  const projectRoot = process.cwd();
  const remoteVersions = listRemoteMigrationVersions(projectRoot, url);
  const workdir = createProductionWorkdir(projectRoot, remoteVersions);
  try {
    const result = spawnSync(
      "corepack",
      [
        "pnpm",
        "exec",
        "supabase",
        "db",
        "push",
        "--include-all",
        ...(dryRun ? ["--dry-run"] : []),
        "--db-url",
        url.href,
        "--workdir",
        workdir,
        "--yes",
      ],
      {
        cwd: projectRoot,
        stdio: "inherit",
        shell: process.platform === "win32",
        timeout: 600_000,
      },
    );
    if (result.error) throw result.error;
    return result.status ?? 1;
  } finally {
    rmSync(workdir, { recursive: true, force: true });
  }
}

try {
  process.exitCode = main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
