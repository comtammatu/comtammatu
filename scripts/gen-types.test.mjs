import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const projectId = "enloyfnuerqgaqderbwb";

test("type generation uses the pinned Supabase CLI when pnpm is unavailable on PATH", () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "comtammatu-gen-types-"));

  try {
    const scriptDir = join(fixtureRoot, "scripts");
    const cliDir = join(fixtureRoot, "node_modules", "supabase", "dist");
    const outputDir = join(fixtureRoot, "packages", "database", "src", "types");
    mkdirSync(scriptDir, { recursive: true });
    mkdirSync(cliDir, { recursive: true });
    mkdirSync(outputDir, { recursive: true });
    copyFileSync(
      new URL("./gen-types.mjs", import.meta.url),
      join(scriptDir, "gen-types.mjs"),
    );
    writeFileSync(
      join(cliDir, "supabase.js"),
      'process.stdout.write("export type Json = string\\n");\n',
    );

    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) => key.toLowerCase() !== "path",
      ),
    );
    env["PATH"] = "";
    env["SUPABASE_PROJECT_ID"] = projectId;

    const result = spawnSync(
      process.execPath,
      [join(scriptDir, "gen-types.mjs")],
      {
        cwd: fixtureRoot,
        encoding: "utf8",
        env,
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      readFileSync(join(outputDir, "database.types.ts"), "utf8"),
      "export type Json = string\n",
    );
  } finally {
    rmSync(fixtureRoot, { force: true, recursive: true });
  }
});
