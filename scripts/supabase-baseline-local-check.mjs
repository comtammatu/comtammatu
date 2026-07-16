#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

const DEFAULT_API_PORT = 55421;
const DEFAULT_DB_PORT = 55432;
const DEFAULT_SHADOW_PORT = 55430;
const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_BASELINE = JSON.parse(
  readFileSync("supabase/migration-lineage.json", "utf8"),
).baselineFile;
// The baseline is self-contained (public + private dumped together), so no
// bootstrap is prepended by default. Pass --bootstrap=<path> only for an older
// public-only baseline whose private.* references need a separate prepend.
const DEFAULT_BOOTSTRAP = null;

function printHelp() {
  process.stdout.write(`Usage:
  pnpm db:baseline:local-check -- --baseline=<path> [options]

Options:
  --baseline=<path>        SQL baseline file to apply before active forward migrations. Default: ${DEFAULT_BASELINE}
  --bootstrap=<path>       Optional private-schema bootstrap prepended to baseline (none by default; baseline is self-contained).
  --workdir=<path>         Scratch workdir. Default: /tmp/comtammatu-baseline-local-check-<timestamp>
  --api-port=<number>      Supabase API port. Default: ${DEFAULT_API_PORT}
  --db-port=<number>       Postgres port. Default: ${DEFAULT_DB_PORT}
  --shadow-port=<number>   Shadow Postgres port. Default: ${DEFAULT_SHADOW_PORT}
  --timeout-ms=<number>    Local start timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --keep                   Keep the scratch project running after success or failure
  --help                   Show this help
`);
}

function parseArgs(argv) {
  const options = {
    apiPort: DEFAULT_API_PORT,
    baseline: null,
    bootstrap: null,
    dbPort: DEFAULT_DB_PORT,
    help: false,
    keep: false,
    shadowPort: DEFAULT_SHADOW_PORT,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    workdir: null,
  };

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--keep") {
      options.keep = true;
    } else if (arg.startsWith("--baseline=")) {
      options.baseline = arg.slice("--baseline=".length);
    } else if (arg.startsWith("--bootstrap=")) {
      options.bootstrap = arg.slice("--bootstrap=".length);
    } else if (arg.startsWith("--workdir=")) {
      options.workdir = arg.slice("--workdir=".length);
    } else if (arg.startsWith("--api-port=")) {
      options.apiPort = Number(arg.slice("--api-port=".length));
    } else if (arg.startsWith("--db-port=")) {
      options.dbPort = Number(arg.slice("--db-port=".length));
    } else if (arg.startsWith("--shadow-port=")) {
      options.shadowPort = Number(arg.slice("--shadow-port=".length));
    } else if (arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  for (const [name, value] of [
    ["--api-port", options.apiPort],
    ["--db-port", options.dbPort],
    ["--shadow-port", options.shadowPort],
    ["--timeout-ms", options.timeoutMs],
  ]) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${name} must be a positive number`);
    }
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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  const stdout = sanitize(result.stdout ?? "");
  const stderr = sanitize(result.stderr ?? "");

  if (result.error) {
    throw result.error;
  }

  if (stdout.trim()) process.stdout.write(`${stdout.trim()}\n`);
  if (stderr.trim()) process.stderr.write(`${stderr.trim()}\n`);

  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
}

function copyActiveForwardMigrations(migrationsDir, baselinePath) {
  const sourceDir = join(process.cwd(), "supabase", "migrations");
  const excluded = new Set([
    "00000000000000_baseline.sql",
    basename(baselinePath),
  ]);

  for (const fileName of readdirSync(sourceDir).sort()) {
    if (!/^\d{14}_.+\.sql$/.test(fileName) || excluded.has(fileName)) {
      continue;
    }
    copyFileSync(join(sourceDir, fileName), join(migrationsDir, fileName));
  }
}

function writeScratchProject(options, baselinePath, bootstrapPath, workdir) {
  const supabaseDir = join(workdir, "supabase");
  const migrationsDir = join(supabaseDir, "migrations");
  mkdirSync(migrationsDir, { recursive: true });

  writeFileSync(
    join(supabaseDir, "config.toml"),
    `project_id = "comtammatu-greenfield-baseline-local-check"

[api]
port = ${options.apiPort}

[db]
port = ${options.dbPort}
shadow_port = ${options.shadowPort}
major_version = 17

[db.seed]
enabled = false

[auth]
enabled = true
site_url = "http://localhost:3000"
`,
  );

  // Optionally prepend a private-schema bootstrap (only needed for an older
  // public-only baseline). The current baseline dumps public + private together,
  // so bootstrapPath is null and the baseline is applied as-is.
  const bootstrapSql = bootstrapPath ? readFileSync(bootstrapPath, "utf8") : "";
  const baselineSql = readFileSync(baselinePath, "utf8");
  writeFileSync(
    join(migrationsDir, "20260526000000_live_schema_baseline.sql"),
    bootstrapSql ? `${bootstrapSql}\n\n${baselineSql}` : baselineSql,
  );
  copyActiveForwardMigrations(migrationsDir, baselinePath);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const baselinePath = resolve(options.baseline ?? DEFAULT_BASELINE);
  if (!existsSync(baselinePath)) {
    throw new Error(`Baseline file does not exist: ${baselinePath}`);
  }

  const bootstrapOption = options.bootstrap ?? DEFAULT_BOOTSTRAP;
  const bootstrapPath = bootstrapOption ? resolve(bootstrapOption) : null;
  if (bootstrapPath && !existsSync(bootstrapPath)) {
    throw new Error(`Bootstrap file does not exist: ${bootstrapPath}`);
  }

  const workdir = resolve(
    options.workdir ?? `/tmp/comtammatu-baseline-local-check-${stamp()}`,
  );

  writeScratchProject(options, baselinePath, bootstrapPath, workdir);

  let startError = null;
  try {
    run("pnpm", ["dlx", "supabase", "db", "start", "--workdir", workdir], {
      timeoutMs: options.timeoutMs,
    });
    process.stdout.write(
      `Supabase Local baseline check passed in ${workdir}\n`,
    );
  } catch (error) {
    startError = error;
    throw error;
  } finally {
    if (!options.keep) {
      try {
        run(
          "pnpm",
          ["dlx", "supabase", "stop", "--workdir", workdir, "--no-backup"],
          { timeoutMs: 120_000 },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Scratch stop failed: ${sanitize(message)}\n`);
        if (!startError) {
          throw error;
        }
      } finally {
        rmSync(workdir, { recursive: true, force: true });
      }
    } else {
      process.stdout.write(`Scratch project kept at ${workdir}\n`);
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${sanitize(message)}\n`);
  process.exit(1);
});
