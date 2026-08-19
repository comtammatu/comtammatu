import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("page tab panels stay outside the semantic page header", () => {
  const surface = read("../app/components/surface/app-page-header.tsx");

  assert.match(surface, /<\/header>\s*\{tabs \? <div>\{tabs\}<\/div> : null\}/);
});

test("page tabs reject unknown URL values", () => {
  const pageTabs = read("../app/components/app-page-tabs.tsx");
  const urlTabs = read("../app/_components/url-tabs.tsx");

  assert.match(pageTabs, /validValues=\{items\.map\(\(item\) => item\.value\)\}/);
  assert.match(urlTabs, /validValues\.includes\(requestedValue\)/);
});

test("primary page tabs use the canonical segmented Tabs contract", () => {
  const pageTabs = read("../app/components/app-page-tabs.tsx");

  assert.match(
    pageTabs,
    /size=\{isTouchLayout \? "touch" : "default"\}/,
  );
  assert.doesNotMatch(pageTabs, /variant="toolbar"/);
  assert.match(pageTabs, /Badge variant="outline"/);
  assert.match(pageTabs, /className="flex-none px-2\.5"/);
});

test("toolbar Tabs keep content width and the muted track token", () => {
  const tabs = read("../../../packages/ui/src/components/tabs.tsx");

  assert.match(tabs, /toolbar:\s*\n\s*"h-auto w-fit[\s\S]*?\bbg-muted\b/);
  assert.doesNotMatch(tabs, /toolbar:[\s\S]*?bg-muted\/30/);
  assert.doesNotMatch(tabs, /data-active:bg-card/);
  assert.doesNotMatch(tabs, /data-active:shadow-sm/);
  assert.match(
    tabs,
    /group-data-\[variant=toolbar\]\/tabs-list:flex-none/,
  );
});

test("Branch workflow tabs use the named touch contract", () => {
  const source = read(
    "../app/(protected)/br/_shared/settings/tables/tables-client.tsx",
  );
  assert.match(source, /<TabsList[\s\S]*?size="touch"/);
  assert.doesNotMatch(source, /<Tabs(?:List|Trigger)[^>]*className="[^"]*h-1[1246]/);
});

test("operator queue filters use ToggleGroup touch, not Tabs", () => {
  for (const path of [
    "../app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
    "../app/(protected)/br/[branchId]/(operator)/stock/consumption/branch-consumption-list-client.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /<ToggleGroup[\s\S]*?size="touch"/);
    assert.doesNotMatch(source, /from "@comtammatu\/ui\/components\/tabs"/);
  }
});
