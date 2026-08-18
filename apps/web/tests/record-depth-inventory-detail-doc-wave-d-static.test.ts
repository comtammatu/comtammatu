import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Inventory DETAIL+DOC chrome — Wave D (Frame burn-down leftovers).
 *
 * Section/callout boxes use AppSection (or Alert/NoteCallout for tinted
 * callouts). Frame remains only as the layout-free inset primitive.
 * Waste approvals stay the ADR 0018 D0 queue exception (AppPage + AppSection
 * decision cards — never AppListFrame / DataTable LIST recipe).
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

test("Wave D waste approvals D0 queue uses AppSection cards, not LIST frame", () => {
  const client = read(
    "app/(protected)/inventory/waste/approvals/waste-approvals-client.tsx",
  );

  assert.match(client, /AppPage/, "waste approvals: AppPage");
  assert.match(client, /AppPageHeader/, "waste approvals: AppPageHeader");
  assert.match(
    client,
    /AppSection/,
    "waste approvals: AppSection decision cards",
  );
  assert.doesNotMatch(
    client,
    /AppListFrame/,
    "waste approvals: ADR D0 exception — not LIST frame",
  );
  assert.doesNotMatch(
    client,
    /from "@comtammatu\/ui\/components\/frame"/,
    "waste approvals: no Frame card chrome",
  );
  assert.doesNotMatch(
    client,
    /from "@\/components\/data-table"|<DataTable[\s>]/,
    "waste approvals: no DataTable LIST recipe",
  );
});

test("Wave D stocktake count DOC keeps DocumentFormFrame + NumberPad wizard", () => {
  const client = read(
    "app/(protected)/inventory/stocktake/[id]/count/count-client.tsx",
  );

  assert.match(client, /DocumentFormFrame/, "stocktake count: DocumentFormFrame");
  assert.match(client, /StocktakeCountWizard/, "stocktake count: NumberPad wizard");
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
