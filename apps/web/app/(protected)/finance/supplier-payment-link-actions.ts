"use server";

import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import type { ActionResult } from "@comtammatu/shared/types";
import { z } from "zod";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { messages } from "@lib/messages";

const OWNER_ROLES: readonly StaffRole[] = ["owner"];
const copy = messages.finance.bankTransactions.supplierPaymentLink;

const setSepaySupplierPaymentLinksSchema = z.object({
  eventId: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  supplierPaymentIds: z
    .array(z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER))
    .max(200)
    .refine((ids) => new Set(ids).size === ids.length),
});

type SupplierPaymentLinkRpcError = {
  code?: string;
  message?: string;
};

function mapSupplierPaymentLinkError(error: SupplierPaymentLinkRpcError): {
  error: string;
  errorCode: string;
} {
  const normalized = error.message?.toLowerCase() ?? "";

  if (error.code === "42501" || normalized.includes("forbidden_owner_only")) {
    return { error: copy.errors.forbidden, errorCode: "FORBIDDEN" };
  }
  if (
    error.code === "PGRST202" ||
    normalized.includes("set_sepay_supplier_payment_links")
  ) {
    return { error: copy.errors.notReady, errorCode: "RPC_NOT_READY" };
  }
  if (normalized.includes("supplier_payment_amount_mismatch")) {
    return {
      error: copy.errors.amountMismatch,
      errorCode: "AMOUNT_MISMATCH",
    };
  }
  if (
    normalized.includes("supplier_payment_not_found") ||
    normalized.includes("webhook_event_not_found") ||
    normalized.includes("supplier_payment_not_bank_transfer") ||
    normalized.includes("supplier_payment_already_linked") ||
    normalized.includes("supplier_payment_link_invalid")
  ) {
    return {
      error: copy.errors.evidenceChanged,
      errorCode: "EVIDENCE_CHANGED",
    };
  }
  if (
    normalized.includes("webhook_event_signature_invalid") ||
    normalized.includes("webhook_event_failed") ||
    normalized.includes("webhook_event_not_final_unclassified") ||
    normalized.includes("webhook_event_not_out") ||
    normalized.includes("webhook_event_matches_payment") ||
    normalized.includes("webhook_event_matches_expense")
  ) {
    return {
      error: copy.errors.eventUnavailable,
      errorCode: "EVENT_UNAVAILABLE",
    };
  }

  return { error: copy.errors.actionError, errorCode: "LINK_FAILED" };
}

export async function setSepaySupplierPaymentLinks(
  input: z.infer<typeof setSepaySupplierPaymentLinksSchema>,
): Promise<ActionResult> {
  const parsed = setSepaySupplierPaymentLinksSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: ERRORS_VI.validationFailed,
      errorCode: "VALIDATION_FAILED",
    };
  }

  const ctx = await getAuthContextWithPermission(
    OWNER_ROLES,
    PERMISSION_KEYS.FINANCE_AP_PAY,
  );
  if (!ctx) {
    return {
      success: false,
      error: copy.errors.forbidden,
      errorCode: "FORBIDDEN",
    };
  }

  const supplierPaymentIds = [...parsed.data.supplierPaymentIds].sort(
    (left, right) => left - right,
  );
  const { data, error } = await ctx.supabase.rpc(
    "set_sepay_supplier_payment_links",
    {
      p_event_id: parsed.data.eventId,
      p_supplier_payment_ids: supplierPaymentIds,
    },
  );

  if (error) {
    console.error(
      "[finance:sepay-supplier-payment] failed to update links",
      error.code,
    );
    const mapped = mapSupplierPaymentLinkError(error);
    return { success: false, ...mapped };
  }

  revalidateSurfacePath("/finance/bank-transactions");
  return { success: true, data };
}
