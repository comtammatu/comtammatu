import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Wave 3 — waste/count composition + DETAIL embedded burn.
 *
 * Count and waste approval Owner queues converge on management-list (single
 * AppListFrame + AppToolbar). Review remains addressable in a D1 dialog. Dead
 * Owner `embedded` dual presenters burn; ADR 0018 overlay embeds (fulfillment
 * hub / GRN presentation=dialog) remain.
 */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Wave 3 Owner count-slips is one management-list frame with queue filter", () => {
  const source = read(
    "app/(protected)/inventory/count-slips/count-slips-client.tsx",
  );

  assert.match(source, /<AppPage width="xwide" density="compact"/);
  assert.match(source, /<AppListFrame[\s\S]{0,240}toolbar=\{/);
  assert.match(source, /<AppToolbar[\s\S]{0,120}variant="inline"/);
  assert.match(source, /SelectItem value="pending"/);
  assert.match(source, /SelectItem value="history"/);
  assert.equal((source.match(/<AppListFrame/g) ?? []).length, 1);
  assert.match(source, /<AppDialog[\s>]/);
  assert.doesNotMatch(source, /from "@comtammatu\/ui\/components\/sheet"/);
});

test("Wave 3 Owner count-assignments uses AppToolbar search/filters", () => {
  const source = read(
    "app/(protected)/inventory/count-assignments/count-assignments-client.tsx",
  );

  assert.match(source, /<AppPage width="xwide" density="compact"/);
  assert.match(source, /<AppListFrame[\s\S]{0,240}toolbar=\{/);
  assert.match(source, /<AppToolbar[\s\S]{0,120}variant="inline"/);
  assert.match(source, /search=\{/);
  assert.doesNotMatch(source, /<DataTable[\s\S]{0,200}searchable/);
  assert.match(source, /<AppDialog[\s>]/);
});

test("Wave 3 waste approvals uses the canonical LIST frame and review dialog", () => {
  const source = read(
    "app/(protected)/inventory/waste/approvals/waste-approvals-client.tsx",
  );

  assert.match(source, /<AppListFrame[\s\S]{0,240}toolbar=\{/);
  assert.match(source, /<AppToolbar[\s\S]{0,120}variant="inline"/);
  assert.match(source, /<DataTable[\s>]/);
  assert.match(source, /mobileCardRender=/);
  assert.match(source, /<AppDialog[\s>]/);
  assert.match(source, /useDocumentOverlayUrl/);
  assert.match(source, /wasteIssueId/);
  assert.doesNotMatch(source, /AppSection/);
});

test("Wave 3 Branch count/waste stay branch-touch (no DataTable leakage)", () => {
  const surfaces = [
    "app/(protected)/br/[branchId]/(operator)/stock/count-slips/branch-count-slips-client.tsx",
    "app/(protected)/br/[branchId]/(operator)/stock/count-assignments/branch-count-assignments-client.tsx",
    "app/(protected)/br/[branchId]/(operator)/stock/waste-approvals/branch-waste-approvals-client.tsx",
  ];

  for (const path of surfaces) {
    const source = read(path);
    assert.doesNotMatch(source, /<DataTable[\s>]/, `${path}: no DataTable`);
    assert.doesNotMatch(source, /AppListFrame/, `${path}: no AppListFrame`);
    assert.match(source, /ItemGroup|<Item[\s>]/, `${path}: touch Item`);
    assert.match(
      source,
      /<AppSheet[\s>]|<Sheet[\s>]|SheetContent/,
      `${path}: Sheet review`,
    );
  }
});

test("Wave 3 burns dead Owner DETAIL/DOC embedded dual presenters", () => {
  // GRN keeps ADR 0018 `embedded` + `presentation="dialog"` for list-first
  // overlays; other DETAIL/DOC dual presenters must not resurrect `embedded`.
  const burned = [
    "app/(protected)/inventory/stocktake/[id]/stocktake-detail-client.tsx",
    "app/(protected)/inventory/stocktake/[id]/count/count-client.tsx",
    "app/(protected)/inventory/stocktake/new/new-session-client.tsx",
    "app/(protected)/inventory/production/production-create-dialog.tsx",
    "app/(protected)/inventory/production-recipe-panel.tsx",
  ];

  for (const path of burned) {
    const source = read(path);
    assert.doesNotMatch(source, /\bembedded\b/, `${path}: no embedded`);
  }

  const grn = read("app/(protected)/inventory/grn/[id]/grn-detail-client.tsx");
  assert.match(grn, /presentation === "dialog"/);
  assert.match(grn, /\bembedded\b/, "GRN keeps ADR 0018 overlay embed");

  const hub = read(
    "app/(protected)/inventory/transfers/stock-fulfillment-hub-client.tsx",
  );
  assert.match(hub, /\bembedded\b/, "fulfillment hub keeps ADR 0018 embed");
  assert.match(hub, /TransferDetailClient/);
  assert.match(hub, /StockRequestFulfillClient/);
});
