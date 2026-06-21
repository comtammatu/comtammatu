#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const DEFAULT_API_PORT = 55421;
const DEFAULT_DB_PORT = 55432;
const DEFAULT_SHADOW_PORT = 55430;
const DEFAULT_TIMEOUT_MS = 600_000;
const DEFAULT_BASELINE = "supabase/migrations/00000000000000_baseline.sql";
const DEFAULT_BOOTSTRAP = "supabase/_local-dev/private-bootstrap.sql";

function printHelp() {
  process.stdout.write(`Usage:
  pnpm db:baseline:local-check -- --baseline=<path> [options]

Options:
  --baseline=<path>        SQL baseline file to apply. Default: ${DEFAULT_BASELINE}
  --bootstrap=<path>       Private-schema bootstrap prepended to baseline. Default: ${DEFAULT_BOOTSTRAP}
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

  // Prepend the private-schema bootstrap so the baseline's private.* references
  // resolve on a from-empty replay (the --schema=public dump omits them).
  const bootstrapSql = readFileSync(bootstrapPath, "utf8");
  const baselineSql = readFileSync(baselinePath, "utf8");
  writeFileSync(
    join(migrationsDir, "20260526000000_live_schema_baseline.sql"),
    `${bootstrapSql}\n\n${baselineSql}`,
  );
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

  const bootstrapPath = resolve(options.bootstrap ?? DEFAULT_BOOTSTRAP);
  if (!existsSync(bootstrapPath)) {
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
