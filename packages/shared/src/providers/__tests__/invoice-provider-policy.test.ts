import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_INVOICE_PROVIDER,
  LEGACY_INVOICE_PROVIDER,
  normalizeInvoiceProviderChoice,
} from "../invoice-provider-policy";

test("invoice provider defaults to Viettel S-invoice", () => {
  assert.equal(
    normalizeInvoiceProviderChoice(undefined),
    CANONICAL_INVOICE_PROVIDER,
  );
});

test("invoice provider accepts Viettel aliases", () => {
  assert.equal(
    normalizeInvoiceProviderChoice("viettel"),
    CANONICAL_INVOICE_PROVIDER,
  );
  assert.equal(
    normalizeInvoiceProviderChoice("sinvoice"),
    CANONICAL_INVOICE_PROVIDER,
  );
  assert.equal(
    normalizeInvoiceProviderChoice(" SInvoice "),
    CANONICAL_INVOICE_PROVIDER,
  );
});

test("MISA is available only when explicitly selected", () => {
  assert.equal(normalizeInvoiceProviderChoice("misa"), LEGACY_INVOICE_PROVIDER);
});

test("unknown invoice provider does not fall back to MISA", () => {
  assert.equal(normalizeInvoiceProviderChoice("meinvoIce"), null);
});
