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

  const officeBodySource = grnListClientSource.slice(
    grnListClientSource.indexOf("const officeBody"),
    grnListClientSource.indexOf(
      "if (withinOfficeTabs)",
      grnListClientSource.indexOf("const officeBody"),
    ),
  );

  assert.match(officeBodySource, /draftSectionWithinOfficeTabs/);
  assert.match(officeBodySource, /listBody/);
  assert.doesNotMatch(officeBodySource, /paramKey=/);
});
