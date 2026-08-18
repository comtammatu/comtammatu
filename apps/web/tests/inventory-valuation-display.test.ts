import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  grnHasCostPendingLines,
  resolveGrnValuationDisplay,
  resolveStockValuationDisplay,
} from "../lib/inventory/valuation-display";

test("stock valuation treats zero/null WAC with qty as pending, not free", () => {
  assert.equal(
    resolveStockValuationDisplay({ quantity: 12, unitCost: 0 }),
    "pending",
  );
  assert.equal(
    resolveStockValuationDisplay({ quantity: 12, unitCost: null }),
    "pending",
  );
  assert.equal(
    resolveStockValuationDisplay({ quantity: 12, unitCost: 18.5 }),
    "valued",
  );
  assert.equal(
    resolveStockValuationDisplay({ quantity: 0, unitCost: 0 }),
    "empty",
  );
  assert.equal(
    resolveStockValuationDisplay({ quantity: 0, unitCost: null }),
    "empty",
  );
});

test("GRN valuation is pending_invoice until invoice settles cost_pending lines", () => {
  assert.equal(
    resolveGrnValuationDisplay({
      status: "confirmed",
      invoiceId: null,
      hasCostPendingLines: true,
    }),
    "pending_invoice",
  );
  assert.equal(
    resolveGrnValuationDisplay({
      status: "confirmed",
      invoiceId: null,
    }),
    "pending_invoice",
  );
  assert.equal(
    resolveGrnValuationDisplay({
      status: "confirmed",
      invoiceId: 9,
      hasCostPendingLines: true,
    }),
    "pending_invoice",
  );
  assert.equal(
    resolveGrnValuationDisplay({
      status: "confirmed",
      invoiceId: 9,
      hasCostPendingLines: false,
    }),
    "settled",
  );
  assert.equal(
    resolveGrnValuationDisplay({
      status: "draft",
      invoiceId: null,
    }),
    null,
  );
  assert.equal(
    grnHasCostPendingLines([
      { costPending: false },
      { costPending: true },
    ]),
    true,
  );
});

test("stock and GRN surfaces wire valuation display copy and helpers", () => {
  const readWeb = (path: string) =>
    readFileSync(resolve(import.meta.dirname, "..", path), "utf8");

  const messages = readWeb("lib/messages/inventory.ts");
  assert.match(messages, /pendingWac:\s*"Chờ định giá"/);
  assert.match(messages, /pendingInvoice:\s*"Chờ đơn giá"/);
  assert.match(messages, /hintReceivedAwaitingInvoice:/);

  const stockClient = readWeb(
    "app/(protected)/inventory/stock/stock-client.tsx",
  );
  assert.match(stockClient, /resolveStockValuationDisplay/);
  assert.match(stockClient, /valuationCopy\.pendingWac/);

  const stockDetail = readWeb(
    "app/(protected)/inventory/stock/stock-detail-dialog.tsx",
  );
  assert.match(stockDetail, /resolveStockValuationDisplay/);
  assert.match(stockDetail, /valuationCopy\.pendingWac/);

  const grnList = readWeb(
    "app/(protected)/inventory/grn/grn-list-client.tsx",
  );
  assert.match(grnList, /resolveGrnValuationDisplay/);
  assert.match(grnList, /valuationCopy\.pendingInvoice/);

  const grnDetail = readWeb(
    "app/(protected)/inventory/grn/[id]/grn-detail-client.tsx",
  );
  assert.match(grnDetail, /resolveGrnValuationDisplay/);
  assert.match(grnDetail, /grnHasCostPendingLines/);

  const grnActions = readWeb(
    "app/(protected)/inventory/grn-actions.ts",
  );
  assert.match(grnActions, /cost_pending/);
  assert.match(grnActions, /provisional_cost_source/);
});
