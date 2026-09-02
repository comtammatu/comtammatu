import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("page tab panels stay outside the semantic page header", () => {
  const surface = read("../app/components/surface/app-page-header.tsx");

  assert.match(
    surface,
    /<\/header>\s*\{tabs \? \([\s\S]*data-slot="app-page-header-tabs"[\s\S]*\{tabs\}/,
  );
});

test("page tabs reject unknown URL values", () => {
  const pageTabs = read("../app/components/app-page-tabs.tsx");
  const urlTabs = read("../app/_components/url-tabs.tsx");

  assert.match(
    pageTabs,
    /validValues=\{items\.map\(\(item\) => item\.value\)\}/,
  );
  assert.match(urlTabs, /validValues\.includes\(requestedValue\)/);
});

test("primary page tabs use the canonical segmented Tabs contract", () => {
  const pageTabs = read("../app/components/app-page-tabs.tsx");

  assert.match(pageTabs, /size=\{isTouchLayout \? "touch" : "default"\}/);
  assert.doesNotMatch(pageTabs, /variant="toolbar"/);
  assert.match(pageTabs, /layout="scroll"/);
  assert.match(pageTabs, /Badge variant="outline"/);
  assert.doesNotMatch(
    pageTabs,
    /className="flex-none px-2\.5"/,
    "the shared Tabs layout must own trigger sizing",
  );
});

test("Tabs exposes named equal and scroll sub-tab layouts", () => {
  const tabs = read("../../../packages/ui/src/components/tabs.tsx");

  assert.match(tabs, /layout:\s*\{/);
  assert.match(tabs, /equal:\s*"grid w-full grid-flow-col auto-cols-fr/);
  assert.match(tabs, /scroll:\s*\n?\s*"no-scrollbar flex w-full/);
  assert.match(tabs, /data-layout=\{layout\}/);
  assert.match(tabs, /group-data-\[layout=scroll\]\/tabs-list:flex-none/);
});

test("toolbar Tabs keep content width and the muted track token", () => {
  const tabs = read("../../../packages/ui/src/components/tabs.tsx");

  assert.match(tabs, /toolbar:\s*\n\s*"h-auto w-fit[\s\S]*?\bbg-muted\b/);
  assert.doesNotMatch(tabs, /toolbar:[\s\S]*?bg-muted\/30/);
  assert.doesNotMatch(tabs, /data-active:bg-card/);
  assert.doesNotMatch(tabs, /data-active:shadow-sm/);
  assert.match(tabs, /group-data-\[variant=toolbar\]\/tabs-list:flex-none/);
});

test("Branch workflow tabs use the named touch contract", () => {
  const source = read(
    "../app/(protected)/br/_shared/settings/tables/tables-client.tsx",
  );
  assert.match(source, /<TabsList[\s\S]*?size="touch"/);
  assert.doesNotMatch(
    source,
    /<Tabs(?:List|Trigger)[^>]*className="[^"]*h-1[1246]/,
  );
});

test("operator queue filters use standard Pattern A Tabs touch", () => {
  for (const path of [
    "../app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
    "../app/(protected)/br/[branchId]/(operator)/stock/consumption/branch-consumption-list-client.tsx",
  ]) {
    const source = read(path);
    assert.match(source, /<TabsList[\s\S]*?size="touch"/);
    assert.match(source, /<TabsList[\s\S]*?layout="equal"/);
    assert.match(source, /from "@comtammatu\/ui\/components\/tabs"/);
  }
});

test("Branch page sub-tabs declare one of the two named touch layouts", () => {
  for (const path of [
    "../app/(protected)/br/_shared/settings/tables/tables-client.tsx",
    "../app/(protected)/br/[branchId]/(operator)/feedback/_components/branch-feedback-tabs.tsx",
    "../app/(protected)/br/[branchId]/(operator)/orders/operator-orders-client.tsx",
    "../app/(protected)/br/[branchId]/(operator)/team/team-workspace-tabs.tsx",
    "../app/(protected)/br/[branchId]/(operator)/team/attendance/branch-attendance-client.tsx",
    "../app/(protected)/br/[branchId]/(operator)/team/leave-approvals/branch-leave-approvals-client.tsx",
    "../app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
    "../app/(protected)/br/[branchId]/(operator)/stock/consumption/branch-consumption-list-client.tsx",
    "../app/(protected)/br/[branchId]/(operator)/stock/on-hand/branch-stock-on-hand-client.tsx",
    "../app/(protected)/br/[branchId]/(operator)/stock/purchase-requests/branch-purchase-requests-client.tsx",
  ]) {
    const source = read(path);
    const lists = source.match(/<TabsList[\s\S]*?>/g) ?? [];
    assert.ok(lists.length > 0, `${path} must render TabsList`);
    for (const list of lists) {
      assert.match(list, /size="touch"/, `${path} must keep 48px tabs`);
      assert.match(
        list,
        /layout="(?:equal|scroll)"/,
        `${path} must use a named Branch sub-tab layout`,
      );
      assert.doesNotMatch(
        list,
        /grid-cols-|overflow-x-auto/,
        `${path} must not reimplement the named layout`,
      );
    }
  }
});
