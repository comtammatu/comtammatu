import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("table setup owns its job in view URL state and skips inactive rows", () => {
  const page = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/tables/page.tsx",
  );
  const client = read(
    "apps/web/app/(protected)/branch-settings/_shared/tables/tables-client.tsx",
  );

  assert.match(
    page,
    /searchParams: Promise<\{ view\?: string \| string\[\] \}>/,
  );
  assert.match(page, /rawView === "tables" \? "tables" : "zones"/);
  assert.match(page, /activeView === "tables"[\s\S]*\.from\("tables"\)/);
  assert.match(page, /activeView=\{activeView\}/);
  assert.match(client, /<AppPageTabs[\s\S]*paramKey="view"/);
  assert.match(client, /activeView === "zones"[\s\S]*<ZoneTable/);
  assert.match(
    client,
    /activeView === "tables"[\s\S]*<DiningTableSettingsList/,
  );
  assert.doesNotMatch(client, /<Tabs defaultValue|selectedBranchId|<Select/);
});

test("POS setup separates terminal work from the owner stock policy", () => {
  const page = read(
    "apps/web/app/(protected)/br/[branchId]/(operator)/settings/pos/page.tsx",
  );

  assert.match(page, /rawView === "stock" && claims\.user_role !== "owner"/);
  assert.match(
    page,
    /activeView === "terminals"[\s\S]*\.from\("pos_terminals"\)/,
  );
  assert.match(page, /activeView === "stock"[\s\S]*isFeatureEnabledForBranch/);
  assert.match(page, /<AppPageTabs[\s\S]*paramKey="view"/);
  assert.match(
    page,
    /activeView === "terminals"[\s\S]*<TerminalsClient[\s\S]*<TabsContent value="stock">[\s\S]*<StockControlCard/,
  );
});
