"use server";

import { createTaxInvoice as createFinanceTaxInvoice } from "../(protected)/finance/actions";

export async function createTaxInvoice(
  input: Parameters<typeof createFinanceTaxInvoice>[0],
) {
  return createFinanceTaxInvoice(input);
}
