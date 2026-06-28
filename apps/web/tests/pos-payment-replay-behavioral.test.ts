import assert from "node:assert/strict";
import { test } from "node:test";
import {
  existingIssuedInvoiceOutcome,
  mapTaxInvoiceOutcome,
} from "../app/(protected)/br/[branchId]/pos/_lib/invoice-outcome";
import {
  queryActiveInvoiceForOrder,
  type ActiveInvoiceRow,
  type InvoiceQueryClient,
} from "../app/(protected)/finance/_lib/invoice-queries";
import { createSupabaseMock } from "./_helpers/supabase-mock";

// Behavioral (executed) cover for the idempotent-replay money path — supersedes
// the source-only assertions flagged by code-review #14. These EXECUTE the
// decision and the resolve query instead of grepping their source text, so a
// refactor that returns the wrong invoice on replay fails here.

const ok = <T>(data: T) => ({ success: true as const, data });
const fail = (error: string) => ({ success: false as const, error });

/* ── existingIssuedInvoiceOutcome: the replay short-circuit decision ── */

test("replay short-circuits on a genuinely-issued invoice (does NOT re-issue)", () => {
  const outcome = existingIssuedInvoiceOutcome(
    ok({ id: 7, invoice_number: "C25TAA/001", status: "issued" }),
  );
  assert.deepEqual(outcome, {
    status: "issued",
    invoiceId: 7,
    invoiceNumber: "C25TAA/001",
  });
});

test("replay short-circuits on submitted/signing too (lodged at provider)", () => {
  for (const status of ["submitted", "signing"] as const) {
    const outcome = existingIssuedInvoiceOutcome(
      ok({ id: 1, invoice_number: null, status }),
    );
    assert.equal(outcome?.status, status);
  }
});

test("replay with only a draft invoice falls through to issue (compliance)", () => {
  assert.equal(
    existingIssuedInvoiceOutcome(
      ok({ id: 9, invoice_number: null, status: "draft" }),
    ),
    null,
  );
});

test("replay with NO invoice row falls through to issue (NĐ70/2025: must issue)", () => {
  assert.equal(existingIssuedInvoiceOutcome(ok(null)), null);
});

test("replay with an unreadable resolve falls through to issue (never fake success)", () => {
  assert.equal(
    existingIssuedInvoiceOutcome(fail("Không thể kiểm tra hóa đơn.")),
    null,
  );
});

/* ── mapTaxInvoiceOutcome ── */

test("mapTaxInvoiceOutcome marks issued success and non-lodged failed", () => {
  assert.equal(
    mapTaxInvoiceOutcome({ id: 1, invoice_number: "X", status: "issued" })
      .status,
    "issued",
  );
  assert.equal(
    mapTaxInvoiceOutcome({ id: 2, invoice_number: null, status: "draft" })
      .status,
    "failed",
  );
  assert.equal(mapTaxInvoiceOutcome(undefined).status, "failed");
});

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
