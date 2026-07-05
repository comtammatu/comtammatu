import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  buyerEmailSchema,
  resolveInvoiceBuyerFields,
} from "../app/(protected)/finance/_lib/invoice-buyer-fields";

// Behavioral cover for the buyerEmail wiring in createTaxInvoice. The action is
// a "use server" fn whose Supabase client + auth context are not injectable, so
// the buyer-field resolution it uses for BOTH the provider request and the
// tax_invoices write row lives in an extracted pure seam (mirrors
// invoice-queries.ts). Executing the seam proves the provider receives the
// email and the written row carries buyer_email; a source-scan then pins that
// actions.ts actually feeds the seam output into both sinks.

const repoRoot = resolve(process.cwd(), "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");
const ACTIONS = "apps/web/app/(protected)/finance/actions.ts";

/* ── resolveInvoiceBuyerFields: provider request + written row source ── */

test("buyerEmail flows to both the provider request and the written row", () => {
  const fields = resolveInvoiceBuyerFields({
    buyerName: "CÔNG TY ABC",
    buyerTaxCode: "0109429414",
    buyerEmail: "xuannt83@gmail.com",
  });
  // provider request: invoiceProvider.createInvoice({ ..., buyerEmail })
  assert.equal(fields.buyerEmail, "xuannt83@gmail.com");
  // written row: buyer_email: buyerEmail ?? null
  assert.equal(fields.buyerEmail ?? null, "xuannt83@gmail.com");
  assert.equal(fields.buyerNotGetInvoice, false);
});

test("empty-string email normalizes to undefined (→ null in the written row)", () => {
  const fields = resolveInvoiceBuyerFields({
    buyerName: "CÔNG TY ABC",
    buyerTaxCode: "0109429414",
    buyerEmail: "",
  });
  assert.equal(fields.buyerEmail, undefined);
  assert.equal(fields.buyerEmail ?? null, null);
});

test("absent email stays undefined (→ null in the written row)", () => {
  const fields = resolveInvoiceBuyerFields({
    buyerName: "CÔNG TY ABC",
    buyerTaxCode: "0109429414",
  });
  assert.equal(fields.buyerEmail, undefined);
  assert.equal(fields.buyerEmail ?? null, null);
});

test("buyerNotGetInvoice forces buyerEmail undefined even if one is supplied", () => {
  // Rule HDDT-BUYER-EMAIL-GUARD-ON-NO-BUYER.
  const explicit = resolveInvoiceBuyerFields({
    buyerNotGetInvoice: true,
    buyerEmail: "leaked@example.com",
  });
  assert.equal(explicit.buyerEmail, undefined);
  assert.equal(explicit.buyerNotGetInvoice, true);

  // Implicit khách lẻ (no name, no MST) is also buyerNotGetInvoice.
  const implicit = resolveInvoiceBuyerFields({ buyerEmail: "leaked@example.com" });
  assert.equal(implicit.buyerEmail, undefined);
  assert.equal(implicit.buyerNotGetInvoice, true);
});

/* ── buyerEmailSchema: field validation ── */

test("buyerEmailSchema: valid email passes, invalid rejected, '' and undefined accepted", () => {
  assert.equal(buyerEmailSchema.safeParse("xuannt83@gmail.com").success, true);
  assert.equal(buyerEmailSchema.safeParse("not-an-email").success, false);
  assert.equal(buyerEmailSchema.safeParse("").success, true);
  assert.equal(buyerEmailSchema.safeParse(undefined).success, true);
});

test("buyerEmailSchema: rejects an email over 200 chars", () => {
  const long = `${"a".repeat(200)}@example.com`;
  assert.equal(buyerEmailSchema.safeParse(long).success, false);
});

/* ── actions.ts wiring: seam output reaches both sinks ── */

test("createTaxInvoice feeds the resolved buyerEmail to the provider call", () => {
  const src = read(ACTIONS);
  // Buyer fields (incl. buyerEmail) come from the shared resolver.
  assert.match(
    src,
    /const \{ buyerName, buyerTaxCode, buyerAddress, buyerEmail, buyerNotGetInvoice \} =\s*resolveInvoiceBuyerFields\(parsed\.data\)/,
  );
  // Provider request carries buyerEmail.
  assert.match(src, /createInvoice\(\{[\s\S]*?\bbuyerEmail,[\s\S]*?items: invoiceItems/);
});

test("createTaxInvoice writes buyer_email into the tax_invoices row", () => {
  const src = read(ACTIONS);
  assert.match(src, /buyer_email: buyerEmail \?\? null/);
});
