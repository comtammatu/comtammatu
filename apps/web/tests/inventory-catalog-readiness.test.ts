import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  catalogReadinessHasGap,
  filterPurchasedIngredientRows,
  resolveCatalogReadiness,
  summarizeCatalogReadiness,
} from "../lib/inventory/catalog-readiness";

test("active ingredient without Nguồn hàng or NCC is not ready", () => {
  assert.deepEqual(
    resolveCatalogReadiness({
      isActive: true,
      defaultFulfillSiteKind: null,
      hasActiveSupplierLink: false,
    }),
    {
      gaps: ["missing_fulfill_site", "missing_supplier_link"],
      isReady: false,
    },
  );

  assert.equal(
    catalogReadinessHasGap(
      {
        isActive: true,
        defaultFulfillSiteKind: null,
        hasActiveSupplierLink: true,
      },
      "missing_fulfill_site",
    ),
    true,
  );
  assert.equal(
    catalogReadinessHasGap(
      {
        isActive: true,
        defaultFulfillSiteKind: "central_supply",
        hasActiveSupplierLink: false,
      },
      "missing_supplier_link",
    ),
    true,
  );
  assert.equal(
    catalogReadinessHasGap(
      {
        isActive: true,
        defaultFulfillSiteKind: "central_kitchen",
        hasActiveSupplierLink: true,
      },
      "any",
    ),
    false,
  );
});

test("finished goods do not require an NCC catalog gap", () => {
  assert.deepEqual(
    resolveCatalogReadiness({
      isActive: true,
      defaultFulfillSiteKind: "central_kitchen",
      hasActiveSupplierLink: false,
      itemKind: "finished_good",
    }),
    { gaps: [], isReady: true },
  );
  assert.deepEqual(
    resolveCatalogReadiness({
      isActive: true,
      defaultFulfillSiteKind: null,
      hasActiveSupplierLink: false,
      itemKind: "finished_good",
    }),
    { gaps: ["missing_fulfill_site"], isReady: false },
  );
  assert.equal(
    catalogReadinessHasGap(
      {
        isActive: true,
        defaultFulfillSiteKind: "central_kitchen",
        hasActiveSupplierLink: false,
        itemKind: "finished_good",
      },
      "missing_supplier_link",
    ),
    false,
  );
});

test("purchased kinds still require an NCC link", () => {
  assert.equal(
    catalogReadinessHasGap(
      {
        isActive: true,
        defaultFulfillSiteKind: "central_supply",
        hasActiveSupplierLink: false,
        itemKind: "raw_material",
      },
      "missing_supplier_link",
    ),
    true,
  );
});

test("purchase pickers keep only purchased catalog rows", () => {
  const rows = filterPurchasedIngredientRows([
    { id: 1, item_kind: "raw_material" },
    { id: 2, item_kind: "finished_good" },
    { id: 3, item_kind: "semi_finished" },
  ]);
  assert.deepEqual(
    rows.map((row) => row.id),
    [1],
  );
});

test("inactive ingredients are treated as ready for the ops checklist", () => {
  assert.deepEqual(
    resolveCatalogReadiness({
      isActive: false,
      defaultFulfillSiteKind: null,
      hasActiveSupplierLink: false,
    }),
    { gaps: [], isReady: true },
  );
});

test("readiness summary counts distinct gap kinds on active rows", () => {
  const summary = summarizeCatalogReadiness([
    {
      isActive: true,
      defaultFulfillSiteKind: null,
      hasActiveSupplierLink: false,
    },
    {
      isActive: true,
      defaultFulfillSiteKind: "central_supply",
      hasActiveSupplierLink: false,
    },
    {
      isActive: true,
      defaultFulfillSiteKind: "central_kitchen",
      hasActiveSupplierLink: true,
    },
    {
      isActive: false,
      defaultFulfillSiteKind: null,
      hasActiveSupplierLink: false,
    },
  ]);

  assert.deepEqual(summary, {
    activeCount: 3,
    gapCount: 2,
    missingFulfillSiteCount: 1,
    missingSupplierLinkCount: 2,
  });
});

test("ingredients list wires catalog readiness filter and badges", () => {
  const readWeb = (path: string) =>
    readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

  const messages = readWeb("lib/messages/inventory.ts");
  assert.match(messages, /readinessGapsOnly:\s*"Thiếu sẵn sàng"/);
  assert.match(messages, /missingFulfillSite:\s*"Thiếu Nguồn hàng"/);
  assert.match(messages, /missingSupplierLink:\s*"Thiếu NCC"/);

  const client = readWeb(
    "app/(protected)/inventory/ingredients/ingredients-client.tsx",
  );
  assert.match(client, /resolveCatalogReadiness/);
  assert.match(client, /readinessFilter/);
  assert.match(client, /itemKind: item\.item_kind/);

  const listModel = readWeb("lib/inventory/ingredients-list-model.ts");
  assert.match(listModel, /catalogReadinessHasGap/);

  const actions = readWeb(
    "app/(protected)/inventory/ingredient-actions.ts",
  );
  assert.match(actions, /has_active_supplier_link/);
  assert.match(actions, /supplier_items/);
  assert.match(actions, /suppliers!inner/);
});
