#!/usr/bin/env node
// Cross-platform Supabase type generation.
//
// Replaces `pnpm db:types` shell script. The previous implementation used
// `2>/dev/null` which fails on Windows cmd.exe (`The system cannot find the
// path specified`), and `$SUPABASE_PROJECT_ID` shell expansion that does not
// work the same way on cmd vs sh. Lesson #11–#13 in `tasks/lessons.md`.
//
// Behavior:
// - Resolves project id from $SUPABASE_PROJECT_ID env, then .env.local, then a
//   hardcoded fallback (currently the production project — see note below).
// - Captures only stdout; CLI update notice on stderr is shown in console
//   but never poisons the types file.
// - Writes to `packages/database/src/types/database.types.ts`.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function readEnvLocalProjectId() {
  try {
    const env = readFileSync(join(process.cwd(), ".env.local"), "utf8");
    const match = env.match(/^SUPABASE_PROJECT_ID=(.+)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    // no .env.local — fall through
  }
  return "";
}

// Fallback project ref. This is PROD (iexws), read-only for type generation.
// There is currently NO dev Supabase project: the former dev ref was deleted,
// and .env.local also points at prod. Until the owner provisions a new dev
// project, generated types reflect the live prod schema. Once a dev ref
// exists, set SUPABASE_PROJECT_ID (or .env.local) to it instead.
const DEV_PROJECT_ID = "iexwsuaqqenyjiskawoj";
const projectId =
  process.env["SUPABASE_PROJECT_ID"]?.trim() ||
  readEnvLocalProjectId() ||
  DEV_PROJECT_ID;
const outPath = "packages/database/src/types/database.types.ts";

function runTypegen(command, args) {
  return execFileSync(command, args, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

let types;
try {
  types = runTypegen("supabase", [
    "gen",
    "types",
    "typescript",
    "--project-id",
    projectId,
  ]);
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code !== "ENOENT") {
    throw error;
  }

  types = runTypegen("pnpm", [
    "dlx",
    "supabase",
    "gen",
    "types",
    "typescript",
    "--project-id",
    projectId,
  ]);
}

writeFileSync(outPath, types);

const lineCount = types.split("\n").length;
process.stdout.write(`✓ ${outPath} regenerated (${lineCount} lines)\n`);
