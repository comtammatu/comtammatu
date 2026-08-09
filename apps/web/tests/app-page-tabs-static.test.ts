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

test("primary page tabs keep touch-safe targets", () => {
  const pageTabs = read("../app/components/app-page-tabs.tsx");

  assert.match(pageTabs, /<TabsList variant="toolbar" size="touch"/);
});

test("Branch workflow tabs use the named touch contract", () => {
  for (const path of [
    "../app/(protected)/br/_shared/settings/tables/tables-client.tsx",
    "../app/(protected)/br/[branchId]/(operator)/shift/leave-approvals/branch-leave-approvals-client.tsx",
    "../app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
    "../app/(protected)/br/[branchId]/(operator)/stock/consumption/branch-consumption-list-client.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /<TabsList[\s\S]*?size="touch"/);
    assert.doesNotMatch(source, /<Tabs(?:List|Trigger)[^>]*className="[^"]*h-1[1246]/);
  }
});
