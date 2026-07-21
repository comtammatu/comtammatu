import assert from "node:assert/strict";
import { test } from "node:test";
import {
  queryActiveInvoiceForOrder,
  type ActiveInvoiceRow,
  type InvoiceQueryClient,
} from "../app/(protected)/finance/_lib/invoice-queries";
import { createSupabaseMock } from "./_helpers/supabase-mock";

/* ── queryActiveInvoiceForOrder via the Supabase mock harness ── */

function clientWith(resolver: () => { data: unknown; error: unknown }) {
  const mock = createSupabaseMock({ tables: { tax_invoices: resolver } });
  return { mock, client: mock.client as unknown as InvoiceQueryClient };
}

test("resolve returns the active invoice and applies the active-status filter", async () => {
  const row: ActiveInvoiceRow = {
    id: 5,
    invoice_number: "C25TAA/005",
    status: "issued",
  };
  const { mock, client } = clientWith(() => ({ data: row, error: null }));

  const res = await queryActiveInvoiceForOrder(client, 12, 99);
  assert.deepEqual(res, { success: true, data: row });

  const q = mock.calls.queries[0];
  assert.equal(q?.table, "tax_invoices");
  assert.deepEqual(q?.eq, [
    ["order_id", 99],
    ["tenant_id", 12],
  ]);
  assert.deepEqual(q?.not, [
    ["status", "in", '("cancelled","replaced","not_required")'],
  ]);
  assert.equal(q?.terminal, "maybeSingle");
});

test("resolve returns data:null when no active invoice row exists", async () => {
  const { client } = clientWith(() => ({ data: null, error: null }));
  assert.deepEqual(await queryActiveInvoiceForOrder(client, 1, 1), {
    success: true,
    data: null,
  });
});

test("resolve returns a sanitized failure on a query error (no raw message)", async () => {
  const { client } = clientWith(() => ({
    data: null,
    error: { message: "permission denied for table tax_invoices" },
  }));
  assert.deepEqual(await queryActiveInvoiceForOrder(client, 1, 1), {
    success: false,
    error: "Không thể kiểm tra hóa đơn.",
  });
});
