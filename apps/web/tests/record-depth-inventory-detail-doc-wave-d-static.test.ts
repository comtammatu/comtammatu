import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Inventory DETAIL+DOC chrome — Wave D (Frame burn-down leftovers).
 *
 * Section/callout boxes use AppSection (or Alert/NoteCallout for tinted
 * callouts). Frame remains only as the layout-free inset primitive. Waste
 * approvals use the canonical LIST recipe with an addressable D1 review
 * dialog.
 */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Wave D waste create line cards use AppSection, not Frame", () => {
  const wrapper = read(
    "app/(protected)/inventory/waste/new/waste-create-client.tsx",
  );
  const form = read(
    "app/(protected)/inventory/waste/waste-operational-form.tsx",
  );
  const client = `${wrapper}\n${form}`;

  assert.match(client, /DocumentFormFrame/, "waste create: DocumentFormFrame");
  assert.match(client, /AppSection/, "waste create: AppSection line cards");
  assert.doesNotMatch(
    client,
    /from "@comtammatu\/ui\/components\/frame"/,
    "waste create: no Frame import for line cards",
  );
  assert.doesNotMatch(
    client,
    /className="[^"]*\brounded-md\b[^"]*\bborder\b/,
    "waste create: no raw rounded-md+border chrome clone",
  );
});

test("Wave D waste approvals uses LIST chrome with addressable review", () => {
  const client = read(
    "app/(protected)/inventory/waste/approvals/waste-approvals-client.tsx",
  );

  assert.match(client, /AppPage/, "waste approvals: AppPage");
  assert.match(client, /AppPageHeader/, "waste approvals: AppPageHeader");
  assert.match(client, /AppListFrame/, "waste approvals: canonical LIST frame");
  assert.match(
    client,
    /from "@\/components\/data-table\/data-table"|<DataTable[\s>]/,
    "waste approvals: DataTable LIST recipe",
  );
  assert.match(
    client,
    /mobileCardRender=/,
    "waste approvals: touch-safe mobile cards",
  );
  assert.match(client, /<AppDialog[\s>]/, "waste approvals: review dialog");
  assert.match(
    client,
    /useDocumentOverlayUrl[\s\S]*wasteIssueId/,
    "waste approvals: addressable review state",
  );
  assert.doesNotMatch(client, /AppSection/);
  assert.doesNotMatch(client, /from "@comtammatu\/ui\/components\/frame"/);
});

test("Wave D stocktake count DOC keeps DocumentFormFrame + NumberPad wizard", () => {
  const client = read(
    "app/(protected)/inventory/stocktake/[id]/count/count-client.tsx",
  );

  assert.match(
    client,
    /DocumentFormFrame/,
    "stocktake count: DocumentFormFrame",
  );
  assert.match(
    client,
    /StocktakeCountWizard/,
    "stocktake count: NumberPad wizard",
  );
  assert.doesNotMatch(
    client,
    /from "@comtammatu\/ui\/components\/frame"/,
    "stocktake count: no Frame line-card chrome",
  );
  assert.doesNotMatch(
    client,
    /BlindCountingGrid/,
    "stocktake count: retired DataTable pad",
  );
});
