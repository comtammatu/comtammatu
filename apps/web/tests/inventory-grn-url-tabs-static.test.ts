import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const operationsPageSource = readFileSync(
  "app/(protected)/inventory/operations/page.tsx",
  "utf8",
);
const grnListClientSource = readFileSync(
  "app/(protected)/inventory/grn/grn-list-client.tsx",
  "utf8",
);

test("operations GRN list embeds drafts without nested URL tabs", () => {
  assert.match(
    operationsPageSource,
    /<AppPageTabs items=\{tabsList\} defaultValue=\{activeTab\}>/,
  );

  const adminDashboardBodySource = grnListClientSource.slice(
    grnListClientSource.indexOf("const adminDashboardBody"),
    grnListClientSource.indexOf(
      "if (withinAdminDashboardTabs)",
      grnListClientSource.indexOf("const adminDashboardBody"),
    ),
  );

  assert.match(
    adminDashboardBodySource,
    /draftSectionWithinAdminDashboardTabs/,
  );
  assert.match(adminDashboardBodySource, /listBody/);
  assert.doesNotMatch(adminDashboardBodySource, /paramKey=/);
});
