import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const readWeb = (path: string): string =>
  readFileSync(join(process.cwd(), path), "utf8");

const listSourceFiles = (path: string): string[] =>
  readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(path, entry.name);
    return entry.isDirectory() ? listSourceFiles(entryPath) : [entryPath];
  });

test("web disables PPR fallback rendering until Next.js fixes action routing", () => {
  const pkg = readWeb("package.json");
  const config = readWeb("next.config.ts");
  assert.match(pkg, /"next": "16\.3\.3"/);
  assert.match(config, /cacheComponents:\s*false/);
  assert.match(config, /partialPrefetching:\s*false/);
  assert.doesNotMatch(config, /useOffline:\s*true/);
  assert.match(config, /agentRules:\s*false/);
});

test("instant route config stays absent while Cache Components is disabled", () => {
  const sourceFiles = listSourceFiles(join(process.cwd(), "app")).filter(
    (path) => path.endsWith(".ts") || path.endsWith(".tsx"),
  );

  for (const path of sourceFiles) {
    assert.doesNotMatch(
      readFileSync(path, "utf8"),
      /export const instant\s*=/,
      path,
    );
  }
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
