import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const grnPageSource = readFileSync(
  "app/(protected)/inventory/grn/page.tsx",
  "utf8",
);
const grnListClientSource = readFileSync(
  "app/(protected)/inventory/grn/grn-list-client.tsx",
  "utf8",
);

test("GRN is a direct route and /inventory/operations is gone", () => {
  assert.equal(
    existsSync("app/(protected)/inventory/operations/page.tsx"),
    false,
  );
  assert.match(
    grnPageSource,
    /<GRNListPageContent searchParams=\{searchParams\} \/>/,
  );

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

test("GRN drafts tab matches main list record-depth chrome", () => {
  const draftsTab = grnListClientSource.slice(
    grnListClientSource.indexOf("function GrnDraftsTab"),
    grnListClientSource.indexOf("function GrnMobileCard"),
  );

  assert.match(draftsTab, /const draftColumns/);
  assert.match(draftsTab, /<DataTable/);
  assert.match(draftsTab, /<AppListFrame/);
  assert.match(draftsTab, /<AppToolbar[\s\S]{0,120}variant="inline"/);
  assert.match(draftsTab, /font-mono text-primary hover:underline/);
  assert.match(draftsTab, /grnDraftHref\(basePath,\s*draft\)/);
  assert.match(draftsTab, /getDraftRowActions/);
  assert.match(draftsTab, /<RowActionsMenu/);
  assert.match(draftsTab, /renderRowContextMenu=\{/);
  assert.match(draftsTab, /onRowClick=\{openDraft\}/);
  assert.match(draftsTab, /mobileCardRender=\{/);
  assert.match(draftsTab, /StatusBadge domain="inventory" value="draft"/);
  assert.match(draftsTab, /key:\s*"continue"/);
  assert.match(draftsTab, /key:\s*"discard"/);
  assert.match(draftsTab, /destructive:\s*true/);
  assert.doesNotMatch(draftsTab, /from "@comtammatu\/ui\/components\/item"/);
  assert.doesNotMatch(draftsTab, /<Item[\s>]/);
  assert.doesNotMatch(draftsTab, /ItemHeader|ItemFooter|ItemTitle/);
});
