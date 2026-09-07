import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { test } from "node:test";

const webRoot = resolve(import.meta.dirname, "..");
const rpcPattern = /\.rpc\(\s*["']has_permission(?:_any)?["']/;

const allowed = new Set([
  "proxy.ts",
  join("app", "(public)", "(auth)", "login", "actions.ts").replaceAll(
    "\\",
    "/",
  ),
]);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (
      entry === "node_modules" ||
      entry === ".next" ||
      entry === "tests" ||
      entry === "e2e"
    ) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, acc);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    acc.push(full);
  }
  return acc;
}

test("production TS permission probes go through has_permission_batch except proxy and login", () => {
  const hits: string[] = [];
  for (const file of walk(join(webRoot, "app")).concat(walk(join(webRoot, "lib")))) {
    const rel = relative(webRoot, file).replaceAll("\\", "/");
    if (allowed.has(rel) || rel === "proxy.ts") continue;
    const source = readFileSync(file, "utf8");
    if (rpcPattern.test(source)) hits.push(rel);
  }
  const proxy = readFileSync(join(webRoot, "proxy.ts"), "utf8");
  assert.match(proxy, /\.rpc\(\s*"has_permission"/);
  assert.deepEqual(hits, []);
});

test("permission coalescer is the only has_permission_batch caller", () => {
  const coalescer = readFileSync(
    join(webRoot, "app/_lib/permission-coalescer.ts"),
    "utf8",
  );
  assert.match(coalescer, /has_permission_batch/);
  assert.match(coalescer, /createPermissionCoalescer/);
});
