import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const operationsPageSource = readFileSync(
  "app/(protected)/inventory/operations/page.tsx",
  "utf8",
);
const grnPageSource = readFileSync(
  "app/(protected)/inventory/grn/page.tsx",
  "utf8",
);
const grnListClientSource = readFileSync(
  "app/(protected)/inventory/grn/grn-list-client.tsx",
  "utf8",
);

test("GRN is a direct route and operations links redirect to it", () => {
  assert.match(operationsPageSource, /: "\/inventory\/grn"/);
  assert.match(
    grnPageSource,
    /<GRNListPageContent searchParams=\{searchParams\} \/>/,
  );
  assert.doesNotMatch(operationsPageSource, /AppPageTabs|GRNListPageContent/);

  const ownerBodySource = grnListClientSource.slice(
    grnListClientSource.indexOf("const ownerBody"),
    grnListClientSource.indexOf(
      "if (withinOwnerTabs)",
      grnListClientSource.indexOf("const ownerBody"),
    ),
  );

  assert.match(ownerBodySource, /draftSectionWithinOwnerTabs/);
  assert.match(ownerBodySource, /listBody/);
  assert.doesNotMatch(ownerBodySource, /paramKey=/);
});
