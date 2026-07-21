#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const MANIFEST_PATH = "supabase/migration-lineage.json";
const MIGRATIONS_PATH = "supabase/migrations";
const ARCHIVE_PATH = "supabase/migration-archive";
const VERSIONED_SQL = /^(\d{14})_.+\.sql$/;
const BASELINE_SQL = /^(\d{14})_baseline\.sql$/;
const FUNCTION_ACL_RESET =
  'REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA "public", "private" FROM "anon", "authenticated", "service_role";';
const errors = [];

function fail(message) {
  errors.push(message);
}

function readManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  } catch (error) {
    fail(
      `${MANIFEST_PATH}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {};
  }
}

const manifest = readManifest();
const {
  baselineFile,
  baselineSha256,
  baselineVersion,
} = manifest;

if (!/^\d{14}$/.test(baselineVersion ?? "")) {
  fail(`${MANIFEST_PATH}: baselineVersion must be 14 digits`);
}
if (!/^[a-f0-9]{64}$/.test(baselineSha256 ?? "")) {
  fail(`${MANIFEST_PATH}: baselineSha256 must be a SHA-256 hex digest`);
}

const expectedBaselineFile = `${MIGRATIONS_PATH}/${baselineVersion}_baseline.sql`;
if (baselineFile !== expectedBaselineFile) {
  fail(`${MANIFEST_PATH}: baselineFile must be ${expectedBaselineFile}`);
}
if (!existsSync(baselineFile ?? "")) {
  fail(`${String(baselineFile)} does not exist`);
} else {
  const baselineSql = readFileSync(baselineFile);
  const actualHash = createHash("sha256").update(baselineSql).digest("hex");
  if (actualHash !== baselineSha256) {
    fail(
      `${baselineFile}: hash drifted; only the re-baseline workflow may update the baseline and manifest together`,
    );
  }
  if (!baselineSql.toString("utf8").includes(FUNCTION_ACL_RESET)) {
    fail(
      `${baselineFile}: must neutralize fresh-environment function ACL defaults before restoring production grants`,
    );
  }
}

if (!existsSync(ARCHIVE_PATH) || !statSync(ARCHIVE_PATH).isDirectory()) {
  fail(`${ARCHIVE_PATH} must remain outside ${MIGRATIONS_PATH}`);
}
if (existsSync(join(MIGRATIONS_PATH, "_archive"))) {
  fail(
    `${MIGRATIONS_PATH}/_archive is forbidden; historical SQL belongs in ${ARCHIVE_PATH}`,
  );
}

const migrations = [];
if (!existsSync(MIGRATIONS_PATH)) {
  fail(`${MIGRATIONS_PATH} does not exist`);
} else {
  for (const entry of readdirSync(MIGRATIONS_PATH, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "README.md") continue;
    if (!entry.isFile() || !VERSIONED_SQL.test(entry.name)) {
      fail(
        `${MIGRATIONS_PATH}/${entry.name}: active migration input must contain only top-level timestamped SQL files`,
      );
      continue;
    }
    migrations.push(entry.name);
  }
}

const baselines = migrations.filter((file) => BASELINE_SQL.test(file));
if (
  baselines.length !== 1 ||
  baselines[0] !== `${baselineVersion}_baseline.sql`
) {
  fail(
    `${MIGRATIONS_PATH}: expected exactly one ${baselineVersion}_baseline.sql`,
  );
}

const versions = new Map();
for (const file of migrations) {
  const version = file.match(VERSIONED_SQL)?.[1];
  if (!version) continue;
  const previous = versions.get(version);
  if (previous)
    fail(
      `${MIGRATIONS_PATH}: duplicate version ${version} in ${previous} and ${file}`,
    );
  versions.set(version, file);
}

const forwards = migrations.filter((file) => !BASELINE_SQL.test(file));
for (const file of forwards) {
  const version = file.slice(0, 14);
  if (version <= baselineVersion) {
    fail(
      `${MIGRATIONS_PATH}/${file}: forward version must be newer than baseline ${baselineVersion}`,
    );
  }
}

if (errors.length > 0) {
  for (const message of errors) console.error(`[migration-lineage] ${message}`);
  process.exit(1);
}

console.log(
  `[migration-lineage] baseline ${baselineVersion}; active forwards ${forwards.length}`,
);
