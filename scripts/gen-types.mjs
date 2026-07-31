#!/usr/bin/env node
// Cross-platform Supabase type generation.
//
// Replaces `pnpm db:types` shell script. The previous implementation used
// `2>/dev/null` which fails on Windows cmd.exe (`The system cannot find the
// path specified`), and `$SUPABASE_PROJECT_ID` shell expansion that does not
// work the same way on cmd vs sh. Lesson #11–#13 in `tasks/lessons.md`.
//
// Behavior:
// - Generates from the registered Production type source only after an explicit matching project ref.
//   Typegen is read-only and never loads stored env or link state.
// - Captures only stdout; CLI update notice on stderr is shown in console
//   but never poisons the types file.
// - Writes to `packages/database/src/types/database.types.ts`.

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const TYPE_SOURCE_PROJECT_ID = "enloyfnuerqgaqderbwb";
const requestedProjectId = process.env["SUPABASE_PROJECT_ID"]?.trim();
if (requestedProjectId !== TYPE_SOURCE_PROJECT_ID) {
  console.error(
    `gen-types: SUPABASE_PROJECT_ID must explicitly match Production ${TYPE_SOURCE_PROJECT_ID}.`,
  );
  process.exit(1);
}
const outPath = "packages/database/src/types/database.types.ts";
const supabaseCliPath = resolve(
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
);

function sanitizeTypes(raw) {
  return String(raw)
    .split("\n")
    .filter((line) => !line.startsWith('{"_tag":'))
    .join("\n");
}

function isValidTypes(text) {
  return text.trimStart().startsWith("export type Json =");
}

function runTypegen(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "inherit"],
    });
  } catch (error) {
    const stdout =
      error && typeof error === "object" && "stdout" in error
        ? String(error.stdout ?? "")
        : "";
    if (isValidTypes(sanitizeTypes(stdout))) return stdout;
    throw error;
  }
}

let types = runTypegen(process.execPath, [
  supabaseCliPath,
  "gen",
  "types",
  "typescript",
  "--project-id",
  TYPE_SOURCE_PROJECT_ID,
]);

types = sanitizeTypes(types);
if (!isValidTypes(types)) {
  console.error(
    "gen-types: CLI output is not a TypeScript types payload — refusing to write.",
  );
  process.exit(1);
}

writeFileSync(outPath, types);

const lineCount = types.split("\n").length;
process.stdout.write(`✓ ${outPath} regenerated (${lineCount} lines)\n`);
