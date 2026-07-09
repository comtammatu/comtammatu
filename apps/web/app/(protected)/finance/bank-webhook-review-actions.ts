"use server";

import type { Json } from "@comtammatu/database";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { z } from "zod";
import { logAudit } from "@/_lib/audit";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { canAccessBranch } from "@/_lib/branch-scope";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { messages } from "@lib/messages";
import {
  readSepayBankWebhookReview,
  SEPAY_BANK_WEBHOOK_REVIEW_VALUES,
} from "./_lib/sepay-bank-transaction-model";

const FINANCE_ROLES: readonly StaffRole[] = ["owner"];
const financeActionErrors = messages.finance.actionErrors;

const reviewMissingBankWebhookPaymentSchema = z.object({
  paymentId: z.coerce.number().int().positive(),
  status: z.enum(SEPAY_BANK_WEBHOOK_REVIEW_VALUES),
});

const linkSepayTransactionToPaymentSchema = z.object({
  eventId: z.coerce.number().int().positive(),
  paymentId: z.coerce.number().int().positive(),
});

interface ReviewablePaymentRow {
  id: number;
  branch_id: number;
  provider_data: unknown;
}

type LinkPaymentRpcError = {
  code?: string;
  message?: string;
};

type LinkPaymentRpcClient = {
  rpc: (
    fn: "link_sepay_transaction_to_payment",
    args: { p_event_id: number; p_payment_id: number },
  ) => PromiseLike<{ data: unknown; error: LinkPaymentRpcError | null }>;
};

function asJsonObject(value: unknown): Record<string, Json> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

function mapLinkPaymentError(error: LinkPaymentRpcError): string {
  const normalized = error.message?.toLowerCase() ?? "";

  if (error.code === "42501" || normalized.includes("forbidden")) {
    return "Không có quyền gắn giao dịch này.";
  }
  if (
    error.code === "PGRST202" ||
    normalized.includes("link_sepay_transaction_to_payment")
  ) {
    return "Chức năng gắn payment chưa sẵn sàng.";
  }
  if (normalized.includes("payment_not_found")) {
    return "Không tìm thấy payment VietQR đã thu.";
  }
  if (normalized.includes("webhook_event_not_found")) {
    return "Không tìm thấy giao dịch ngân hàng.";
  }
  if (normalized.includes("webhook_event_already_linked")) {
    return "Giao dịch này đã gắn payment.";
  }
  if (normalized.includes("webhook_event_failed")) {
    return "Lỗi webhook không được gắn payment.";
  }
  if (normalized.includes("webhook_event_not_in")) {
    return "Chỉ gắn payment cho giao dịch tiền vào.";
  }
  if (normalized.includes("payment_amount_mismatch")) {
    return "Số tiền payment không khớp giao dịch ngân hàng.";
  }
  if (normalized.includes("payment_already_has_bank_webhook")) {
    return "Payment này đã có webhook ngân hàng.";
  }
  if (normalized.includes("webhook_event_signature_invalid")) {
    return "Webhook chưa hợp lệ chữ ký.";
  }
  if (normalized.includes("webhook_event_amount_invalid")) {
    return "Số tiền webhook không hợp lệ.";
  }

  console.error(
    "[finance:bank-webhook-review] unmapped link payment rpc error",
    error.code,
    error.message,
  );
  return "Không thể gắn giao dịch với payment.";
}

export async function linkSepayTransactionToPayment(
  input: z.infer<typeof linkSepayTransactionToPaymentSchema>,
): Promise<ActionResult> {
  const parsed = linkSepayTransactionToPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) {
    return { success: false, error: "Không có quyền đối soát thanh toán." };
  }

  const { supabase } = ctx;
  const { data, error } = await (supabase as LinkPaymentRpcClient).rpc(
    "link_sepay_transaction_to_payment",
    {
      p_event_id: parsed.data.eventId,
      p_payment_id: parsed.data.paymentId,
    },
  );

  if (error) {
    console.error(
      "[finance:bank-webhook-review] failed to link payment",
      error.code,
    );
    return { success: false, error: mapLinkPaymentError(error) };
  }

  revalidateSurfacePath("/finance/bank-transactions");
  return { success: true, data };
}

export async function reviewMissingBankWebhookPayment(
  input: z.infer<typeof reviewMissingBankWebhookPaymentSchema>,
): Promise<ActionResult> {
  const parsed = reviewMissingBankWebhookPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) {
    return { success: false, error: "Không có quyền đối soát thanh toán." };
  }

  const { supabase, claims, user } = ctx;
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id, branch_id, provider_data")
    .eq("tenant_id", claims.tenant_id)
    .eq("id", parsed.data.paymentId)
    .eq("method", "vietqr")
    .eq("status", "completed")
    .maybeSingle();

  if (paymentError) {
    console.error(
      "[finance:bank-webhook-review] failed to load payment",
      paymentError.code,
    );
    return { success: false, error: financeActionErrors.loadPaymentFailed };
  }

  if (!payment) {
    return {
      success: false,
      error: "Không tìm thấy thanh toán VietQR đã thu.",
    };
  }

  const row = payment as ReviewablePaymentRow;
  if (!(await canAccessBranch(supabase, claims, row.branch_id))) {
    return { success: false, error: "Không có quyền cho chi nhánh này." };
  }

  const reviewedAt = new Date().toISOString();
  const previousReview = readSepayBankWebhookReview(row.provider_data);
  const nextReview = {
    status: parsed.data.status,
    reviewedAt,
    reviewedBy: user.id,
  } satisfies Record<string, Json>;

  // ponytail: store the pilot review marker beside provider data; split to a reconciliation table when assignment/history is required.
  const nextProviderData = {
    ...asJsonObject(row.provider_data),
    bankWebhookReview: nextReview,
  } satisfies Record<string, Json>;

  const { data: updatedPayment, error: updateError } = await supabase
    .from("payments")
    .update({ provider_data: nextProviderData })
    .eq("tenant_id", claims.tenant_id)
    .eq("id", row.id)
    .eq("method", "vietqr")
    .eq("status", "completed")
    .select("id")
    .maybeSingle();

  if (updateError || !updatedPayment) {
    if (updateError) {
      console.error(
        "[finance:bank-webhook-review] failed to update payment",
        updateError.code,
      );
    }
    return { success: false, error: "Không thể cập nhật trạng thái." };
  }

  await logAudit(supabase, {
    action: "update_bank_webhook_review",
    entityType: "payment",
    entityId: row.id,
    oldData: { bankWebhookReview: previousReview },
    newData: { bankWebhookReview: nextReview },
  });

  revalidateSurfacePath("/finance/bank-transactions");
  return { success: true };
}
