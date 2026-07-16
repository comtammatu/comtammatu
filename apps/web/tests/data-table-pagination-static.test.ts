import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// DataTable owns client-side paging when `pageSize` is set without
// `totalCount`. Two contracts must hold: the adapter slices (callers pass the
// full array), and row callbacks still receive the ABSOLUTE index — inline
// line-edit sheets patch by index and would corrupt lines past page 1
// otherwise.

const source = readFileSync(
  join(import.meta.dirname, "../app/components/data-table/data-table.tsx"),
  "utf8",
);

test("adapter slices only when totalCount does not signal server paging", () => {
  assert.match(source, /pageSize != null && totalCount == null/);
  assert.match(source, /data\.slice\(pageOffset, pageOffset \+/);
});

test("both render planes map the sliced page, never the full array", () => {
  const pagedMaps = source.match(/pagedData\.map\(/g) ?? [];
  assert.equal(pagedMaps.length, 2, "mobile card list + desktop table body");
  assert.doesNotMatch(source, /\n\s*data\.map\(/);
});

test("row callbacks receive the absolute index across pages", () => {
  assert.match(source, /index \+ pageOffset/);
  assert.match(source, /const index = sliceIndex \+ pageOffset/);
});

test("page derives clamped so a shrinking filter result cannot strand the view", () => {
  assert.match(
    source,
    /Math\.min\(currentPage \?\? internalPage, totalPages\)/,
  );
});

test("blank action headers retain an accessible table heading", () => {
  assert.match(source, /col\.header === ""/);
  assert.match(source, /FORM_VI\.action/);
  assert.doesNotMatch(source, /hideOnMobile/);
});

test("growth lists opted in", () => {
  for (const rel of [
    "../app/(protected)/orders/orders-client.tsx",
    "../app/(protected)/orders/refunds-client.tsx",
    "../app/(protected)/inventory/grn/grn-list-client.tsx",
    "../app/(protected)/inventory/supplier-invoices/supplier-invoices-client.tsx",
    "../app/(protected)/admin/settings/printers/jobs/print-jobs-client.tsx",
    "../app/(protected)/hr/staff/audit/permission-audit-table.tsx",
  ]) {
    const client = readFileSync(join(import.meta.dirname, rel), "utf8");
    assert.match(client, /pageSize=\{50\}/, rel);
  }
});
