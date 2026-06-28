"use server";

import {
  createTaxInvoice as createFinanceTaxInvoice,
  resolveExistingInvoiceForOrder as resolveFinanceExistingInvoiceForOrder,
} from "../(protected)/finance/actions";

export async function createTaxInvoice(
  input: Parameters<typeof createFinanceTaxInvoice>[0],
) {
  return createFinanceTaxInvoice(input);
}

export async function resolveExistingInvoiceForOrder(
  orderId: Parameters<typeof resolveFinanceExistingInvoiceForOrder>[0],
) {
  return resolveFinanceExistingInvoiceForOrder(orderId);
}
