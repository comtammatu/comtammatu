import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

test("root route renders the work location picker", () => {
  const rootPage = read("apps/web/app/page.tsx");
  const legacyBranchPage = read("apps/web/app/(protected)/br/page.tsx");
  const pickerPage = read(
    "apps/web/app/_components/work-location-picker-page.tsx",
  );

  assert.match(rootPage, /WorkLocationPickerPage/);
  assert.match(legacyBranchPage, /redirect\("\/"\)/);
  assert.doesNotMatch(rootPage, /resolvePostLoginRedirect/);
  assert.doesNotMatch(rootPage, /resolveBranchHubContextFromHeaders/);
  assert.doesNotMatch(rootPage, /resolveDiscoveredAppGroups/);
  assert.match(
    pickerPage,
    /AppPageHeader title=\{MODULE_ACL\.branch_picker\.label\}/,
  );
  assert.match(pickerPage, /AppLinkCard/);
  assert.match(pickerPage, /href=\{`\/br\/\$\{site\.id\}`\}/);
  assert.match(pickerPage, /showAdminDashboardCard/);
  assert.match(pickerPage, /APP_COPY_VI\.adminDashboard/);
  assert.match(pickerPage, /href=\{MODULE_ACL\.finance\.path\}/);
  assert.doesNotMatch(rootPage, /messages\.appEntry/);
});
