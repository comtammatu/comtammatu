#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const EXPECTED_PROJECT_REF = "iexwsuaqqenyjiskawoj";
const DEFAULT_SCHEMAS = ["public"];
const DEFAULT_TIMEOUT_MS = 300_000;

function printHelp() {
  process.stdout.write(`Usage:
  pnpm db:baseline:extract:dry-run -- [options]
  pnpm db:baseline:extract -- [options]

Options:
  --schemas=<list>          Comma-separated schemas to dump. Default: public
  --out-dir=<path>          Output directory. Default: .baseline-artifacts/supabase-live-baseline-<timestamp>
  --project-ref=<ref>       Expected linked Supabase project ref. Default: ${EXPECTED_PROJECT_REF}
  --timeout-ms=<number>     Per-schema command timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --dry-run                 Print the sanitized pg_dump plan without writing SQL files
  --help                    Show this help
`);
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    help: false,
    outDir: null,
    projectRef: EXPECTED_PROJECT_REF,
    schemas: DEFAULT_SCHEMAS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg.startsWith("--schemas=") || arg.startsWith("--schema=")) {
      const value = arg.slice(arg.indexOf("=") + 1);
      options.schemas = value
        .split(",")
        .map((schema) => schema.trim())
        .filter(Boolean);
    } else if (arg.startsWith("--out-dir=")) {
      options.outDir = arg.slice("--out-dir=".length);
    } else if (arg.startsWith("--project-ref=")) {
      options.projectRef = arg.slice("--project-ref=".length);
    } else if (arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 10_000) {
    throw new Error("--timeout-ms must be at least 10000");
  }

  if (options.schemas.length === 0) {
    throw new Error("At least one schema is required");
  }

  return options;
}

function stamp() {
  return new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function sanitize(text) {
  return text
    .replace(/(PGPASSWORD=)(?:"[^"]*"|'[^']*'|[^\s]+)/g, "$1REDACTED")
    .replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/g, "$1REDACTED@")
    .replace(/(password=)[^&\s]+/gi, "$1REDACTED");
}

function readLinkedProjectRef() {
  const tempRefPath = join(process.cwd(), "supabase", ".temp", "project-ref");
  if (existsSync(tempRefPath)) {
    return readFileSync(tempRefPath, "utf8").trim();
  }

  return process.env["SUPABASE_PROJECT_ID"]?.trim() ?? "";
}

function readEnvLocalValue(key) {
  const envPath = join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return "";
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    if (line.startsWith(`${key}=`)) {
      return line
        .slice(key.length + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
    }
  }
  return "";
}

// Build a DIRECT superuser connection for the dump. The `supabase db dump
// --linked` temp-login role silently OMITS tables it cannot see — verified
// 2026-05-30 that it dropped 18/118 public tables (feedbacks, webhook_events,
// telegram_*, etc.) with exit 0 and no warning, even with --role postgres.
// A direct postgres connection dumps the full schema. See
// docs/runbooks/supabase-greenfield-baseline.md.
function buildBaselineDbUrl(expectedRef) {
  const explicit =
    (process.env["SUPABASE_DB_URL"] ?? "").trim() ||
    readEnvLocalValue("SUPABASE_DB_URL_IEXW");
  if (explicit) return explicit;

  const poolerPath = join(process.cwd(), "supabase", ".temp", "pooler-url");
  const password = readEnvLocalValue("SUPABASE_PASSWORD_IEXW");
  if (!existsSync(poolerPath) || !password) {
    throw new Error(
      "Privileged dump requires SUPABASE_DB_URL_IEXW (or SUPABASE_PASSWORD_IEXW in " +
        ".env.local plus supabase/.temp/pooler-url). The --linked temp-login dump " +
        "is INCOMPLETE — it drops RLS-restricted tables.",
    );
  }
  const poolerUrl = readFileSync(poolerPath, "utf8").trim();
  if (!poolerUrl.includes(expectedRef)) {
    throw new Error(
      `pooler-url does not target ${expectedRef}; refusing to build baseline connection`,
    );
  }
  const encoded = encodeURIComponent(password);
  return poolerUrl.replace(/^(postgres(?:ql)?:\/\/[^@/]+)@/, `$1:${encoded}@`);
}

function runPnpmSupabase(args, timeoutMs) {
  const result = spawnSync("pnpm", ["dlx", "supabase", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
  });

  const stdout = sanitize(result.stdout ?? "");
  const stderr = sanitize(result.stderr ?? "");

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const detail = [stdout, stderr].filter(Boolean).join("\n").trim();
    throw new Error(detail || `supabase exited with status ${result.status}`);
  }

  return { stdout, stderr };
}

function getSupabaseVersion() {
  try {
    return execFileSync("pnpm", ["dlx", "supabase", "--version"], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    }).trim();
  } catch {
    return "unavailable";
  }
}

function assertProjectRef(expectedRef) {
  const linkedRef = readLinkedProjectRef();
  if (!linkedRef) {
    throw new Error("Cannot determine linked Supabase project ref");
  }

  if (linkedRef !== expectedRef) {
    throw new Error(
      `Linked project ref mismatch. Expected ${expectedRef}, found ${linkedRef}`,
    );
  }

  return linkedRef;
}

function schemaFileName(schema) {
  return `${schema.replace(/[^a-zA-Z0-9_]/g, "_")}.schema.sql`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const linkedRef = assertProjectRef(options.projectRef);
  const dbUrl = buildBaselineDbUrl(options.projectRef);
  const version = getSupabaseVersion();

  if (options.dryRun) {
    for (const schema of options.schemas) {
      process.stdout.write(`\n# Dry run for schema: ${schema}\n`);
      const { stdout, stderr } = runPnpmSupabase(
        ["db", "dump", "--db-url", dbUrl, "--schema", schema, "--dry-run", "--yes"],
        options.timeoutMs,
      );
      if (stderr) process.stderr.write(`${stderr}\n`);
      process.stdout.write(`${stdout}\n`);
    }
    return;
  }

  const outDir = resolve(
    options.outDir ??
      join(".baseline-artifacts", `supabase-live-baseline-${stamp()}`),
  );
  mkdirSync(outDir, { recursive: true });

  const manifest = {
    generatedAt: new Date().toISOString(),
    projectRef: linkedRef,
    supabaseCli: version,
    command: "pnpm dlx supabase db dump --db-url <redacted> --schema <schema>",
    schemas: options.schemas,
    files: [],
  };

  for (const schema of options.schemas) {
    const outputPath = join(outDir, schemaFileName(schema));
    const { stdout, stderr } = runPnpmSupabase(
      [
        "db",
        "dump",
        "--db-url",
        dbUrl,
        "--schema",
        schema,
        "--file",
        outputPath,
        "--yes",
      ],
      options.timeoutMs,
    );

    if (stdout.trim()) process.stdout.write(`${stdout.trim()}\n`);
    if (stderr.trim()) process.stderr.write(`${stderr.trim()}\n`);

    manifest.files.push({
      schema,
      path: outputPath,
      bytes: statSync(outputPath).size,
    });
  }

  const manifestPath = join(outDir, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  process.stdout.write(`Baseline schema artifacts written to ${outDir}\n`);
  process.stdout.write(`Manifest written to ${manifestPath}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${sanitize(message)}\n`);
  process.exit(1);
});
