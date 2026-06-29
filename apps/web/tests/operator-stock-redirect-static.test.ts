import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const exists = (path: string) => existsSync(resolve(repoRoot, path));

const stockRedirects = [
  ["count", "/inventory/stocktake"],
  ["receive", "/inventory/transfers"],
  ["transfer", "/inventory/transfers"],
  ["waste", "/inventory/waste/new"],
] as const;

test("operator stock detail routes redirect to branch-scoped inventory pages", () => {
  for (const [segment, target] of stockRedirects) {
    const path = `apps/web/app/(protected)/br/[branchId]/(operator)/stock/${segment}/page.tsx`;

    assert.equal(exists(path), true, path);

    const source = read(path);
    assert.match(source, /from "next\/navigation"/, path);
    assert.match(source, /params: Promise<\{ branchId: string \}>/, path);
    assert.ok(
      source.includes(`redirect(\`${target}?branchId=${"${branchId}"}\`)`),
      `${path} -> ${target}`,
    );
  }
});

test("operator stock landing routes receive through the operator detail route", () => {
  const source = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/stock/page.tsx",
  );

  assert.doesNotMatch(source, /\/inventory\/receiving/);
  assert.ok(source.includes("href={`/br/${branchId}/stock/receive`}"));
});
