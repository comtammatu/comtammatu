import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Inventory DETAIL+DOC chrome — Wave C (DETAIL polish + Frame inset cleanup).
 */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

test("Wave C production DETAIL uses xwide AppPage + DescriptionList", () => {
  const page = read("app/(protected)/inventory/production/[id]/page.tsx");
  const client = read(
    "app/(protected)/inventory/production/[id]/production-detail-client.tsx",
  );

  assert.match(page, /width="xwide"/, "production/[id] page: xwide");
  assert.match(page, /AppPageHeader/, "production/[id] page: AppPageHeader");
  assert.match(
    client,
    /DescriptionList/,
    "production detail client: DescriptionList",
  );
  assert.match(
    client,
    /AppDetailFooter/,
    "production detail client: AppDetailFooter",
  );
  assert.doesNotMatch(
    client,
    /AppSection title="Tổng quan lệnh"[\s\S]*?<dl /,
    "production detail overview: no hand-rolled dl",
  );
});

test("Wave C GRN create keeps DocumentFormFrame and sticky DOC footer", () => {
  const client = read(
    "app/(protected)/inventory/grn/new/[supplierId]/grn-create-client.tsx",
  );

  assert.match(
    client,
    /DocumentFormFrame/,
    "grn create: keeps DocumentFormFrame",
  );
  assert.match(
    client,
    /<AppDetailFooter[\s\S]*sticky/,
    "grn create: sticky AppDetailFooter CTA rung",
  );
  assert.match(
    client,
    /<DocumentFormFrame[\s\S]*footer=\{footer\}/,
    "grn create: DocumentFormFrame AppPage footer slot (Wave E bleed recipe)",
  );
  assert.match(
    client,
    /showDeskEditor/,
    "grn create: progressive desktop editor (no idle empty pane)",
  );
  assert.match(
    client,
    /pb-24/,
    "grn create: workspace clears sticky AppDetailFooter",
  );
  assert.match(
    client,
    /lg:max-h-\[calc\(100dvh-8\.5rem\)\]/,
    "grn create: desk editor capped above sticky footer",
  );
  assert.match(
    client,
    /contextStrip/,
    "grn create: dense context strip before lines",
  );
  assert.match(
    client,
    /draftEmptyTitle|draftLinesTitle/,
    "grn create: draft lines section always present",
  );
  assert.doesNotMatch(
    client,
    /panelEmptyTitle/,
    "grn create: no idle empty right-pane placeholder",
  );
  assert.doesNotMatch(
    client,
    /from "@comtammatu\/ui\/components\/frame"/,
    "grn create: no Frame warehouse inset (muted AppSection inset)",
  );
  assert.doesNotMatch(
    client,
    /className="[^"]*\brounded-md\b[^"]*\bborder\b/,
    "grn create: no raw rounded-md+border chrome clone",
  );
});

test("Wave C stocktake DETAIL keeps single responsive Owner composition", () => {
  const client = read(
    "app/(protected)/inventory/stocktake/[id]/stocktake-detail-client.tsx",
  );

  assert.doesNotMatch(client, /\bmobileLayout\b/, "stocktake: no mobileLayout");
  assert.match(client, /AppPage/, "stocktake: AppPage");
  assert.match(client, /DescriptionList/, "stocktake: DescriptionList");
  assert.match(
    client,
    /lg:grid-cols-\[minmax\(0,1fr\)_20rem\]/,
    "stocktake: responsive DETAIL grid",
  );
});
