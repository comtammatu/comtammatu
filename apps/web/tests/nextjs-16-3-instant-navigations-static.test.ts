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
  assert.match(
    readWeb("app/q/[token]/page.tsx"),
    /export const instant = false/,
  );
  assert.match(
    readWeb("app/q/invoice/[token]/page.tsx"),
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

test("Branch Ops warms its bounded primary tab set and shows pending feedback", () => {
  const protectedLink = readWeb("app/_components/protected-link.tsx");
  const pendingIndicator = readWeb(
    "app/_components/protected-link-pending-indicator.tsx",
  );
  const bottomNav = readWeb("app/components/app-bottom-nav.tsx");
  const operatorNav = readWeb(
    "app/(protected)/br/[branchId]/(operator)/operator-bottom-nav.tsx",
  );

  assert.match(protectedLink, /prefetchMode === "route"/);
  assert.match(protectedLink, /prefetch=\{true\}/);
  assert.match(pendingIndicator, /useLinkStatus\(\)/);
  assert.match(bottomNav, /prefetchItems && !item\.active/);
  assert.match(bottomNav, /<ProtectedLinkPendingIndicator \/>/);
  assert.match(operatorNav, /<AppBottomNav[\s\S]*prefetchItems/);
});
