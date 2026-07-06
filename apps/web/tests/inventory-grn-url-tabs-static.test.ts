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

test("operations GRN list uses a separate URL key for nested drafts tabs", () => {
  assert.match(
    operationsPageSource,
    /<AppPageTabs items=\{tabsList\} defaultValue=\{activeTab\}>/,
  );

  const officeBodySource = grnListClientSource.slice(
    grnListClientSource.indexOf("const officeBody"),
    grnListClientSource.indexOf(
      "if (embedded)",
      grnListClientSource.indexOf("const officeBody"),
    ),
  );

  assert.match(
    officeBodySource,
    /paramKey=\{embedded \? "grnTab" : undefined\}/,
  );
});
