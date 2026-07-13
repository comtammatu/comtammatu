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
const DEFAULT_SCHEMAS = ["public", "private"];
const DEFAULT_TIMEOUT_MS = 300_000;

// Allowlisted dump targets → which .env.local secrets hold their direct creds.
// The dump ALWAYS uses an explicit --db-url built for the requested ref (never
// --linked, which silently drops RLS-restricted tables), so the target may
// differ from the currently-linked project. Only refs listed here are accepted.
const KNOWN_TARGETS = {
  iexwsuaqqenyjiskawoj: {
    passwordEnv: "SUPABASE_PASSWORD_IEXW",
    explicitUrlEnv: "SUPABASE_DB_URL_IEXW",
  },
};

function printHelp() {
  process.stdout.write(`Usage:
  pnpm db:baseline:extract:dry-run -- [options]
  pnpm db:baseline:extract -- [options]

Options:
  --schemas=<list>          Comma-separated schemas to dump. Default: public,private
  --out-dir=<path>          Output directory. Default: .baseline-artifacts/supabase-live-baseline-<timestamp>
  --baseline-out=<path>     Assemble private + public dumps into a replay baseline
  --project-ref=<ref>       Expected linked Supabase project ref. Default: ${EXPECTED_PROJECT_REF}
  --timeout-ms=<number>     Per-schema command timeout. Default: ${DEFAULT_TIMEOUT_MS}
  --engine=<name>           pg_dump (libpq, Docker-free; default) or cli (supabase CLI, needs Docker)
  --dry-run                 Print the sanitized pg_dump plan without writing SQL files
  --help                    Show this help
`);
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    help: false,
    baselineOut: null,
    outDir: null,
    projectRef: EXPECTED_PROJECT_REF,
    schemas: DEFAULT_SCHEMAS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    engine: "pg_dump",
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
    } else if (arg.startsWith("--baseline-out=")) {
      options.baselineOut = arg.slice("--baseline-out=".length);
    } else if (arg.startsWith("--project-ref=")) {
      options.projectRef = arg.slice("--project-ref=".length);
    } else if (arg.startsWith("--timeout-ms=")) {
      options.timeoutMs = Number(arg.slice("--timeout-ms=".length));
    } else if (arg.startsWith("--engine=")) {
      options.engine = arg.slice("--engine=".length).trim();
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 10_000) {
    throw new Error("--timeout-ms must be at least 10000");
  }

  if (!["pg_dump", "cli"].includes(options.engine)) {
    throw new Error("--engine must be pg_dump or cli");
  }

  if (options.schemas.length === 0) {
    throw new Error("At least one schema is required");
  }

  if (
    options.baselineOut &&
    (!options.schemas.includes("public") ||
      !options.schemas.includes("private"))
  ) {
    throw new Error("--baseline-out requires both public and private schemas");
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

  return (
    process.env["SUPABASE_PROJECT_ID"]?.trim() ??
    readEnvLocalValue("SUPABASE_PROJECT_ID")
  );
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
// 2026-05-30 that it dropped RLS-restricted public tables (for example
// webhook_events) with exit 0 and no warning, even with --role postgres.
// A direct postgres connection dumps the full schema. See
// supabase/migrations/README.md.
function buildBaselineDbUrl(expectedRef) {
  const target = KNOWN_TARGETS[expectedRef];
  if (!target) {
    throw new Error(
      `Unknown dump target ${expectedRef}; add it to KNOWN_TARGETS with its password env`,
    );
  }

  // 1. Explicit full URL override (process env, then .env.local). Must target
  //    the requested ref so a stale override can't dump the wrong project.
  const explicit =
    (process.env["SUPABASE_DB_URL"] ?? "").trim() ||
    readEnvLocalValue(target.explicitUrlEnv);
  if (explicit) {
    if (!explicit.includes(expectedRef)) {
      throw new Error(
        `${target.explicitUrlEnv} does not target ${expectedRef}; refusing`,
      );
    }
    return explicit;
  }

  // 2. Build from the shared session-pooler host + this target's password. The
  //    .temp/pooler-url belongs to the linked project; both known targets are in
  //    the same region so the pooler host is identical — swap the ref segment.
  const poolerPath = join(process.cwd(), "supabase", ".temp", "pooler-url");
  const linkedRef = readLinkedProjectRef();
  const password =
    readEnvLocalValue(target.passwordEnv) ||
    (linkedRef === expectedRef
      ? readEnvLocalValue("SUPABASE_DB_PASSWORD")
      : "");
  if (!existsSync(poolerPath) || !password) {
    throw new Error(
      `Privileged dump for ${expectedRef} requires ${target.explicitUrlEnv} (or ` +
        `${target.passwordEnv}, or SUPABASE_DB_PASSWORD when the linked ref matches, ` +
        "in .env.local plus supabase/.temp/pooler-url). The " +
        "--linked temp-login dump is INCOMPLETE — it drops RLS-restricted tables.",
    );
  }
  let poolerUrl = readFileSync(poolerPath, "utf8").trim();
  if (linkedRef && linkedRef !== expectedRef && poolerUrl.includes(linkedRef)) {
    poolerUrl = poolerUrl.split(linkedRef).join(expectedRef);
  }
  if (!poolerUrl.includes(expectedRef)) {
    throw new Error(
      `pooler-url does not target ${expectedRef} after ref-swap; refusing to build baseline connection`,
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
  if (!KNOWN_TARGETS[expectedRef]) {
    throw new Error(
      `Unknown dump target ${expectedRef}; only allowlisted refs may be dumped`,
    );
  }
  // The dump always builds an explicit --db-url for expectedRef (never the
  // --linked path), so expectedRef may legitimately differ from the currently
  // linked project. The allowlist + buildBaselineDbUrl's URL-targets-ref check
  // are the safety guard.
  return expectedRef;
}

function findPgDump() {
  const explicit = (process.env["PG_DUMP_BIN"] ?? "").trim();
  if (explicit) return explicit;
  try {
    const prefix = execFileSync("brew", ["--prefix", "libpq"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 30_000,
    }).trim();
    const candidate = join(prefix, "bin", "pg_dump");
    if (existsSync(candidate)) return candidate;
  } catch {
    // brew not available — fall through to PATH lookup
  }
  return "pg_dump";
}

// Docker-free dump via a direct pg_dump binary (libpq). The Supabase CLI wraps
// pg_dump in Docker; this path needs neither. Applies the two replay fixups that
// matter for a fresh Supabase restore: idempotent public/private schema creation and
// neutralised psql `\restrict`/`\unrestrict` meta-lines (pg_dump 18).
function runPgDumpEngine({ dbUrl, schema, outputPath, dryRun, timeoutMs }) {
  const bin = findPgDump();
  if (dryRun) {
    process.stdout.write(
      `# pg_dump engine (libpq): ${bin} --schema-only --schema=${schema} --no-owner --dbname <redacted>\n`,
    );
    return;
  }
  const result = spawnSync(
    bin,
    [
      "--schema-only",
      `--schema=${schema}`,
      "--no-owner",
      "--file",
      outputPath,
      "--dbname",
      dbUrl,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: timeoutMs,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = sanitize(
      [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
    );
    throw new Error(detail || `pg_dump exited with status ${result.status}`);
  }
  const fixed = readFileSync(outputPath, "utf8")
    .replace(/^\\(un)?restrict .*$/gm, (m) => `-- ${m}`)
    .replace(
      /^CREATE SCHEMA public;$/gm,
      "CREATE SCHEMA IF NOT EXISTS public;",
    );
  writeFileSync(outputPath, fixed);
}

function schemaFileName(schema) {
  return `${schema.replace(/[^a-zA-Z0-9_]/g, "_")}.schema.sql`;
}

function assembleBaseline(outDir, baselineOut) {
  const privateSql = readFileSync(
    join(outDir, schemaFileName("private")),
    "utf8",
  );
  const publicSql = readFileSync(join(outDir, schemaFileName("public")), "utf8")
    .split(/\r?\n/)
    .filter(
      (line) =>
        !line.startsWith("ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin "),
    )
    .join("\n");
  const outputPath = resolve(baselineOut);
  writeFileSync(
    outputPath,
    `SET check_function_bodies = false;\n\n${privateSql.trimEnd()}\n\n${publicSql.trimEnd()}\n`,
  );
  return outputPath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const targetRef = assertProjectRef(options.projectRef);
  const dbUrl = buildBaselineDbUrl(options.projectRef);
  const version = getSupabaseVersion();

  if (options.dryRun) {
    for (const schema of options.schemas) {
      process.stdout.write(
        `\n# Dry run (engine=${options.engine}) for schema: ${schema}\n`,
      );
      if (options.engine === "pg_dump") {
        runPgDumpEngine({ dbUrl, schema, dryRun: true });
      } else {
        const { stdout, stderr } = runPnpmSupabase(
          [
            "db",
            "dump",
            "--db-url",
            dbUrl,
            "--schema",
            schema,
            "--dry-run",
            "--yes",
          ],
          options.timeoutMs,
        );
        if (stderr) process.stderr.write(`${stderr}\n`);
        process.stdout.write(`${stdout}\n`);
      }
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
    projectRef: targetRef,
    engine: options.engine,
    supabaseCli: version,
    command:
      options.engine === "pg_dump"
        ? "pg_dump --schema-only --schema=<schema> --no-owner --dbname <redacted>"
        : "pnpm dlx supabase db dump --db-url <redacted> --schema <schema>",
    schemas: options.schemas,
    files: [],
  };

  for (const schema of options.schemas) {
    const outputPath = join(outDir, schemaFileName(schema));
    if (options.engine === "pg_dump") {
      runPgDumpEngine({
        dbUrl,
        schema,
        outputPath,
        dryRun: false,
        timeoutMs: options.timeoutMs,
      });
    } else {
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
    }

    manifest.files.push({
      schema,
      path: outputPath,
      bytes: statSync(outputPath).size,
    });
  }

  if (options.baselineOut) {
    const baselinePath = assembleBaseline(outDir, options.baselineOut);
    manifest.baseline = {
      path: baselinePath,
      bytes: statSync(baselinePath).size,
    };
  }

  const manifestPath = join(outDir, "manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  process.stdout.write(`Baseline schema artifacts written to ${outDir}\n`);
  if (manifest.baseline) {
    process.stdout.write(
      `Replay baseline written to ${manifest.baseline.path}\n`,
    );
  }
  process.stdout.write(`Manifest written to ${manifestPath}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${sanitize(message)}\n`);
  process.exit(1);
});
