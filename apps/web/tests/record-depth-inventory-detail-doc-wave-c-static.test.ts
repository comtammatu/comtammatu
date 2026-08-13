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

test("Wave C production DETAIL is a list overlay shim", () => {
  const page = read("app/(protected)/inventory/production/[id]/page.tsx");
  const client = read(
    "app/(protected)/inventory/production/[id]/production-detail-client.tsx",
  );

  assert.match(page, /redirect\(/, "production/[id] page: redirect");
  assert.match(page, /runId/, "production/[id] page: overlay runId");
  assert.doesNotMatch(page, /<AppPage[\s>]|AppPageHeader|ProductionDetailClient/);
  assert.match(
    client,
    /DescriptionList/,
    "production detail client: DescriptionList",
  );
  assert.match(
    client,
    /variant="document"/,
    "production detail client: document dialog",
  );
  assert.doesNotMatch(
    client,
    /AppSection title="Tổng quan lệnh"[\s\S]*?<dl /,
    "production detail overview: no hand-rolled dl",
  );
});

test("Wave C GRN create routes stay redirect-only after direct-create retirement", () => {
  const page = read("app/(protected)/inventory/grn/new/page.tsx");
  const supplierPage = read(
    "app/(protected)/inventory/grn/new/[supplierId]/page.tsx",
  );

  assert.match(page, /redirect\("\/inventory\/grn"\)/);
  assert.match(supplierPage, /redirect\("\/inventory\/grn"\)/);
  assert.doesNotMatch(page, /GrnCreateClient|DocumentFormFrame/);
  assert.doesNotMatch(supplierPage, /GrnCreateClient|DocumentFormFrame/);
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
