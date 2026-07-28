import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Inventory DETAIL+DOC chrome — Wave B (D2 dual-layout collapse).
 *
 * Owner DETAIL clients must keep one responsive composition — no parallel
 * `pageLayout` / `mobileLayout` hand trees. Branch `embedded` may keep a thin
 * chrome wrapper around the same body.
 */

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const DUAL_LAYOUT_DETAIL = [
  {
    name: "issues/[id]",
    path: "app/(protected)/inventory/issues/[id]/issue-detail-client.tsx",
  },
  {
    name: "transfers/[id]",
    path: "app/(protected)/inventory/transfers/[id]/transfer-detail-client.tsx",
  },
] as const;

test("Wave B DETAIL clients ban dual pageLayout/mobileLayout trees", () => {
  for (const surface of DUAL_LAYOUT_DETAIL) {
    const source = read(surface.path);

    assert.doesNotMatch(
      source,
      /\bmobileLayout\b/,
      `${surface.name}: no mobileLayout identifier`,
    );
    assert.doesNotMatch(
      source,
      /const mobileLayout\s*=/,
      `${surface.name}: no mobileLayout const`,
    );
    assert.match(
      source,
      /const pageLayout\s*=/,
      `${surface.name}: single pageLayout body`,
    );
    assert.match(
      source,
      /order-1[\s\S]*lg:order-2|order-2[\s\S]*lg:order-1/,
      `${surface.name}: responsive column order`,
    );
    assert.match(source, /AppPage/, `${surface.name}: AppPage Owner chrome`);
    assert.match(
      source,
      /AppDetailFooter/,
      `${surface.name}: AppDetailFooter`,
    );
    assert.match(
      source,
      /DescriptionList/,
      `${surface.name}: DescriptionList metadata`,
    );
  }
});

test("Wave B GRN DETAIL keeps single tree without mobileLayout", () => {
  const source = read(
    "app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );
  assert.doesNotMatch(source, /\bmobileLayout\b/, "grn: no mobileLayout");
  assert.match(source, /AppPage/, "grn: AppPage");
  assert.match(source, /AppDetailFooter/, "grn: AppDetailFooter");
  assert.match(source, /DescriptionList/, "grn: DescriptionList");
});

test("Wave B issues DETAIL uses Item totals and no dual-tree switch", () => {
  const issues = read(
    "app/(protected)/inventory/issues/[id]/issue-detail-client.tsx",
  );

  assert.doesNotMatch(
    issues,
    /isTouchLayout\s*\?\s*mobileLayout/,
    "issues: no isTouchLayout ? mobileLayout switch",
  );
  assert.match(
    issues,
    /sticky=\{isTouchLayout\}/,
    "issues: sticky footer on touch via shared tree",
  );
  assert.match(
    issues,
    /<Item[\s\S]*totalLinesColon/,
    "issues: line totals use Item inset (not raw rounded+border chrome)",
  );
  assert.doesNotMatch(
    issues,
    /className="[^"]*\brounded-md\b[^"]*\bborder\b/,
    "issues: no raw rounded-md+border chrome",
  );
});

test("Wave B transfers DETAIL renders pageLayout once for Owner", () => {
  const transfers = read(
    "app/(protected)/inventory/transfers/[id]/transfer-detail-client.tsx",
  );

  assert.doesNotMatch(
    transfers,
    /\{content\}\s*\{!embedded && pageLayout\}/,
    "transfers: no double body render",
  );
  assert.match(
    transfers,
    /<AppPageHeader[\s\S]*\{pageLayout\}/,
    "transfers: Owner AppPageHeader + single pageLayout",
  );
});
