"use server";

import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { z } from "zod";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { SEPAY_BANK_WEBHOOK_REVIEW_VALUES } from "./_lib/sepay-bank-transaction-model";

const FINANCE_ROLES: readonly StaffRole[] = ["owner"];

const reviewMissingBankWebhookPaymentSchema = z.object({
  paymentId: z.coerce.number().int().positive(),
  status: z.enum(SEPAY_BANK_WEBHOOK_REVIEW_VALUES),
});

const linkSepayTransactionToPaymentSchema = z
  .object({
    bankTransactionId: z.number().int().positive().nullable(),
    eventId: z.number().int().positive().nullable(),
    paymentId: z.coerce.number().int().positive(),
  })
  .refine(
    (input) => input.bankTransactionId != null || input.eventId != null,
  );
const recordBankTransactionCashDepositSchema = z.object({
  bankTransactionId: z.coerce.number().int().positive(),
});

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

type RecordCashDepositRpcClient = {
  rpc: (
    fn: "record_bank_transaction_cash_deposit",
    args: { p_bank_transaction_id: number },
  ) => PromiseLike<{ data: unknown; error: LinkPaymentRpcError | null }>;
};

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
  if (
    normalized.includes("payment_not_found") ||
    normalized.includes("bank_reconciliation_target_not_found")
  ) {
    return "Không tìm thấy payment VietQR đã thu.";
  }
  if (
    normalized.includes("webhook_event_not_found") ||
    normalized.includes("bank_transaction_not_found")
  ) {
    return "Không tìm thấy giao dịch ngân hàng.";
  }
  if (
    normalized.includes("webhook_event_already_linked") ||
    normalized.includes("bank_reconciliation_target_already_matched")
  ) {
    return "Giao dịch này đã gắn payment.";
  }
  if (normalized.includes("webhook_event_failed")) {
    return "Lỗi webhook không được gắn payment.";
  }
  if (
    normalized.includes("webhook_event_not_in") ||
    normalized.includes("bank_transaction_direction_mismatch")
  ) {
    return "Chỉ gắn payment cho giao dịch tiền vào.";
  }
  if (
    normalized.includes("payment_amount_mismatch") ||
    normalized.includes("bank_reconciliation_amount_mismatch")
  ) {
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

function mapCashDepositError(error: LinkPaymentRpcError): string {
  const normalized = error.message?.toLowerCase() ?? "";

  if (error.code === "42501" || normalized.includes("forbidden")) {
    return "Chỉ Owner mới được xác nhận nộp tiền mặt.";
  }
  if (
    error.code === "PGRST202" ||
    normalized.includes("record_bank_transaction_cash_deposit")
  ) {
    return "Chức năng nộp tiền mặt chưa sẵn sàng.";
  }
  if (normalized.includes("bank_transaction_not_found")) {
    return "Không tìm thấy giao dịch ngân hàng.";
  }
  if (normalized.includes("bank_transaction_direction_mismatch")) {
    return "Chỉ ghi nhận nộp tiền mặt từ giao dịch tiền vào.";
  }
  if (
    normalized.includes("bank_transaction_already_reconciled") ||
    normalized.includes("cash_deposit_link_invalid")
  ) {
    return "Giao dịch này đã được đối soát theo cách khác.";
  }

  console.error(
    "[finance:bank-webhook-review] unmapped cash deposit rpc error",
    error.code,
    error.message,
  );
  return "Không thể ghi nhận nộp tiền mặt.";
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
  const canonicalResult =
    parsed.data.bankTransactionId == null
      ? null
      : await supabase.rpc("reconcile_bank_transaction_targets", {
          p_bank_transaction_id: parsed.data.bankTransactionId,
          p_target_type: "payment",
          p_target_ids: [parsed.data.paymentId],
        });
  const legacyResult =
    canonicalResult != null || parsed.data.eventId == null
      ? null
      : await (supabase as LinkPaymentRpcClient).rpc(
          "link_sepay_transaction_to_payment",
          {
            p_event_id: parsed.data.eventId,
            p_payment_id: parsed.data.paymentId,
          },
        );
  const data = canonicalResult?.data ?? legacyResult?.data ?? null;
  const error = canonicalResult?.error ?? legacyResult?.error ?? null;

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

export async function recordBankTransactionCashDeposit(
  input: z.infer<typeof recordBankTransactionCashDepositSchema>,
): Promise<ActionResult> {
  const parsed = recordBankTransactionCashDepositSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Dữ liệu không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) {
    return { success: false, error: "Không có quyền xác nhận nộp tiền mặt." };
  }

  const { data, error } = await (
    ctx.supabase as RecordCashDepositRpcClient
  ).rpc("record_bank_transaction_cash_deposit", {
    p_bank_transaction_id: parsed.data.bankTransactionId,
  });

  if (error) {
    console.error(
      "[finance:bank-webhook-review] failed to record cash deposit",
      error.code,
    );
    return { success: false, error: mapCashDepositError(error) };
  }

  revalidateSurfacePath("/finance");
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

  const { supabase } = ctx;
  const { error } = await supabase.rpc("review_completed_vietqr_bank_webhook", {
    p_payment_id: parsed.data.paymentId,
    p_status: parsed.data.status,
  });

  if (error) {
    console.error(
      "[finance:bank-webhook-review] failed to review payment",
      error.code,
    );
    return {
      success: false,
      error:
        error.code === "P0002"
          ? "Không tìm thấy thanh toán VietQR đã thu."
          : "Không thể cập nhật trạng thái.",
    };
  }

  revalidateSurfacePath("/finance/bank-transactions");
  return { success: true };
}
