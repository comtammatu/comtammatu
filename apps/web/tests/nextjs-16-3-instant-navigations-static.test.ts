import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const readWeb = (path: string): string =>
  readFileSync(join(process.cwd(), path), "utf8");

test("web is on Next.js 16.3 Instant Navigations without offline retry", () => {
  const pkg = readWeb("package.json");
  const config = readWeb("next.config.ts");
  assert.match(pkg, /"next": "\^16\.3\./);
  assert.match(config, /cacheComponents:\s*true/);
  assert.match(config, /partialPrefetching:\s*true/);
  assert.doesNotMatch(config, /useOffline:\s*true/);
  assert.match(config, /agentRules:\s*false/);
});

test("root and station layouts opt out of instant validation", () => {
  assert.match(readWeb("app/layout.tsx"), /export const instant = false/);
  assert.match(
    readWeb("app/(protected)/layout.tsx"),
    /export const instant = false/,
  );
  assert.match(
    readWeb("app/(protected)/br/[branchId]/(operator)/layout.tsx"),
    /export const instant = false/,
  );
  assert.match(
    readWeb("app/(protected)/br/[branchId]/pos/layout.tsx"),
    /export const instant = false/,
  );
  assert.match(
    readWeb("app/(protected)/br/[branchId]/kds/layout.tsx"),
    /export const instant = false/,
  );
  assert.match(
    readWeb("app/(protected)/br/[branchId]/pickup/layout.tsx"),
    /export const instant = false/,
  );
  assert.match(
    readWeb("app/(protected)/me/layout.tsx"),
    /export const instant = false/,
  );
});

test("Cổng catalog and on-hand stream behind Suspense with URL prefetch", () => {
  const catalogPage = readWeb(
    "app/(protected)/br/[branchId]/(operator)/stock/catalog/page.tsx",
  );
  const catalogShell = readWeb(
    "app/(protected)/br/[branchId]/(operator)/stock/catalog/catalog-page-shell.tsx",
  );
  const onHandPage = readWeb(
    "app/(protected)/br/[branchId]/(operator)/stock/on-hand/page.tsx",
  );
  const onHandDetail = readWeb(
    "app/(protected)/br/[branchId]/(operator)/stock/on-hand/[ingredientId]/page.tsx",
  );
  const onHandClient = readWeb(
    "app/(protected)/br/[branchId]/(operator)/stock/on-hand/branch-stock-on-hand-client.tsx",
  );
  assert.match(catalogShell, /<Suspense fallback=\{<PageSkeleton bare \/>\}>/);
  assert.match(catalogPage, /<CatalogIndex params=\{params\} \/>/);
  assert.match(onHandPage, /<Suspense fallback=\{<PageSkeleton bare \/>\}>/);
  assert.match(onHandDetail, /<Suspense fallback=\{<PageSkeleton bare \/>\}>/);
  assert.match(onHandClient, /prefetch=\{true\}/);
});
