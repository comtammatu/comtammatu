import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = join(import.meta.dirname, "../../..");
const vercelIgnore = join(repoRoot, ".vercelignore");
const vercelJson = readFileSync(join(process.cwd(), "vercel.json"), "utf8");

test("Vercel ignoreCommand needs git metadata from the cloned repo", () => {
  const config = JSON.parse(vercelJson) as {
    git?: { ignoreCommand?: string };
  };
  assert.match(
    config.git?.ignoreCommand ?? "",
    /\bgit diff --name-only HEAD\^ HEAD\b/,
  );
});

test("vercelignore must not strip .git or Next.js output", () => {
  if (!existsSync(vercelIgnore)) return;
  const patterns = readFileSync(vercelIgnore, "utf8")
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .filter(Boolean);
  for (const pattern of patterns) {
    assert.notEqual(pattern, ".git");
    assert.notEqual(pattern, ".git/");
    assert.notEqual(pattern, ".next");
    assert.notEqual(pattern, ".next/");
    assert.notEqual(pattern, "**/.next/");
    assert.doesNotMatch(pattern, /(^|\/)\.git(\/|$)/);
    assert.doesNotMatch(pattern, /(^|\/|\*)\.next(\/|$)/);
  }
});
