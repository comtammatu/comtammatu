"use server";

import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { z } from "zod";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { SEPAY_BANK_WEBHOOK_REVIEW_VALUES } from "./_lib/sepay-bank-transaction-model";

const FINANCE_ROLES = MODULE_ACL.finance.allowedRoles;

const LIKE_WILDCARD = String.fromCharCode(37);
const MATCHABLE_PAYMENT_PAGE_SIZE = 8;

const searchSepayMatchablePaymentsSchema = z.object({
  query: z.string().trim().max(64).default(""),
  amount: z.number().positive().optional(),
});

export type SepayMatchablePayment = {
  paymentId: number;
  paymentCode: string;
  orderId: number;
  orderNumber: string;
  amount: number;
  status: "pending" | "completed";
  createdAt: string;
  branchName: string | null;
};

const reviewMissingBankWebhookPaymentSchema = z.object({
  paymentId: z.coerce.number().int().positive(),
  status: z.enum(SEPAY_BANK_WEBHOOK_REVIEW_VALUES),
});

const linkSepayTransactionToPaymentSchema = z
  .object({
    bankTransactionId: z.number().int().positive().nullable(),
    eventId: z.number().int().positive().nullable(),
    paymentCode: z.string().trim().min(1).max(128),
  })
  .refine((input) => input.bankTransactionId != null || input.eventId != null);
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
    return "Chức năng gắn thanh toán chưa sẵn sàng.";
  }
  if (
    normalized.includes("payment_not_found") ||
    normalized.includes("bank_reconciliation_target_not_found") ||
    normalized.includes("sepay_replay_payment_not_pending")
  ) {
    return "Không tìm thấy thanh toán VietQR đang chờ hoặc đã thu.";
  }
  if (
    normalized.includes("webhook_event_not_found") ||
    normalized.includes("bank_transaction_not_found") ||
    normalized.includes("sepay_replay_event_not_found")
  ) {
    return "Không tìm thấy giao dịch ngân hàng.";
  }
  if (
    normalized.includes("webhook_event_already_linked") ||
    normalized.includes("bank_reconciliation_target_already_matched")
  ) {
    return "Giao dịch này đã gắn với một thanh toán.";
  }
  if (normalized.includes("webhook_event_failed")) {
    return "Dữ liệu đồng bộ lỗi không thể gắn với thanh toán.";
  }
  if (
    normalized.includes("webhook_event_not_in") ||
    normalized.includes("bank_transaction_direction_mismatch")
  ) {
    return "Chỉ gắn thanh toán với giao dịch tiền vào.";
  }
  if (
    normalized.includes("payment_amount_mismatch") ||
    normalized.includes("bank_reconciliation_amount_mismatch") ||
    normalized.includes("sepay_replay_amount_mismatch")
  ) {
    return "Số tiền thanh toán không khớp giao dịch ngân hàng.";
  }
  if (normalized.includes("payment_already_has_bank_webhook")) {
    return "Thanh toán này đã có bằng chứng ngân hàng.";
  }
  if (normalized.includes("webhook_event_signature_invalid")) {
    return "Bằng chứng SePay chưa có chữ ký hợp lệ.";
  }
  if (normalized.includes("webhook_event_amount_invalid")) {
    return "Số tiền trên bằng chứng SePay không hợp lệ.";
  }
  if (
    normalized.includes("sepay_replay_event_not_recoverable") ||
    normalized.includes("sepay_replay_event_invalid")
  ) {
    return "Bằng chứng SePay này không đủ điều kiện xử lý lại.";
  }
  if (
    normalized.includes("sepay_replay_payment_code_mismatch") ||
    normalized.includes("sepay_replay_payment_code_required")
  ) {
    return "Mã thanh toán không khớp thanh toán VietQR đang chờ.";
  }
  if (normalized.includes("sepay_replay_payment_already_linked")) {
    return "Thanh toán này đã có giao dịch SePay hợp lệ.";
  }
  if (normalized.includes("sepay_replay_failed")) {
    return "Chưa thể hoàn tất thanh toán từ bằng chứng này. Dữ liệu cũ được giữ nguyên.";
  }

  console.error(
    "[finance:bank-webhook-review] unmapped link payment rpc error",
    error.code,
    error.message,
  );
  return "Không thể gắn giao dịch với thanh toán.";
}

function mapCashDepositError(error: LinkPaymentRpcError): string {
  const normalized = error.message?.toLowerCase() ?? "";

  if (error.code === "42501" || normalized.includes("forbidden")) {
    return "Chỉ chủ quán mới được xác nhận nộp tiền mặt.";
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

type FinanceSupabase = NonNullable<
  Awaited<ReturnType<typeof getAuthContextWithPermission>>
>["supabase"];

type BankMatchOrder = { id: number; paymentCode: string };

type MatchablePaymentRow = {
  id: number;
  amount: number;
  status: string;
  created_at: string;
  order_id: number;
  orders:
    | {
        order_number: string;
        payment_code: string;
        status: string;
        branches: { name: string } | { name: string }[] | null;
      }
    | Array<{
        order_number: string;
        payment_code: string;
        status: string;
        branches: { name: string } | { name: string }[] | null;
      }>
    | null;
};

function escapeIlike(value: string): string {
  return value
    .replaceAll(LIKE_WILDCARD, `\\${LIKE_WILDCARD}`)
    .replaceAll("_", "\\_");
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function resolveOrderForBankMatch(
  supabase: FinanceSupabase,
  tenantId: number,
  token: string,
): Promise<ActionResult<BankMatchOrder>> {
  const byNumber = await supabase
    .from("orders")
    .select("id, payment_code")
    .eq("tenant_id", tenantId)
    .ilike("order_number", token)
    .limit(2);

  if (byNumber.error) {
    console.error(
      "[finance:bank-webhook-review] failed to resolve order number",
      byNumber.error.code,
    );
    return { success: false, error: "Không tìm thấy đơn theo mã đơn." };
  }

  if ((byNumber.data?.length ?? 0) > 1) {
    return {
      success: false,
      error: "Nhiều đơn trùng mã. Chọn đúng đơn trong danh sách.",
    };
  }

  const numbered = byNumber.data?.[0];
  if (numbered != null) {
    return {
      success: true,
      data: { id: numbered.id, paymentCode: numbered.payment_code },
    };
  }

  const byCode = await supabase
    .from("orders")
    .select("id, payment_code")
    .eq("tenant_id", tenantId)
    .eq("payment_code", token)
    .maybeSingle();

  if (byCode.error || byCode.data == null) {
    return { success: false, error: "Không tìm thấy đơn theo mã đơn." };
  }

  return {
    success: true,
    data: { id: byCode.data.id, paymentCode: byCode.data.payment_code },
  };
}

export async function searchSepayMatchablePayments(
  input: z.infer<typeof searchSepayMatchablePaymentsSchema>,
): Promise<ActionResult<{ items: SepayMatchablePayment[] }>> {
  const parsed = searchSepayMatchablePaymentsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Từ khóa tìm đơn không hợp lệ." };
  }

  const query = parsed.data.query;
  const amount = parsed.data.amount;
  if (query === "" && amount == null) {
    return { success: false, error: "Nhập mã đơn trên phiếu." };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) {
    return { success: false, error: "Không có quyền đối soát thanh toán." };
  }

  const { supabase, claims } = ctx;
  const select =
    "id, amount, status, created_at, order_id, orders!inner ( order_number, payment_code, status, branches ( name ) )";

  const runQuery = (column: "orders.order_number" | "orders.payment_code") => {
    let request = supabase
      .from("payments")
      .select(select)
      .eq("tenant_id", claims.tenant_id)
      .eq("method", "vietqr")
      .in("status", ["pending", "completed"])
      .neq("orders.status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(MATCHABLE_PAYMENT_PAGE_SIZE + 1);

    if (query !== "") {
      request = request.ilike(column, `${LIKE_WILDCARD}${escapeIlike(query)}${LIKE_WILDCARD}`);
    } else if (amount != null) {
      request = request.eq("amount", amount);
    }

    return request;
  };

  const primary = await runQuery("orders.order_number");
  let rows = (primary.data ?? []) as unknown as MatchablePaymentRow[];
  if (primary.error) {
    console.error(
      "[finance:bank-match-search] failed to search orders",
      primary.error.code,
    );
    return { success: false, error: "Không tải được đơn chờ đối soát." };
  }

  if (rows.length === 0 && query !== "") {
    const fallback = await runQuery("orders.payment_code");
    if (fallback.error) {
      console.error(
        "[finance:bank-match-search] failed to search payment codes",
        fallback.error.code,
      );
      return { success: false, error: "Không tải được đơn chờ đối soát." };
    }
    rows = (fallback.data ?? []) as unknown as MatchablePaymentRow[];
  }

  const pageRows = rows.slice(0, MATCHABLE_PAYMENT_PAGE_SIZE);
  const paymentIds = pageRows.map((row) => row.id);
  const { data: matchRows, error: matchError } =
    paymentIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("bank_transaction_reconciliation_matches")
          .select("payment_id")
          .eq("tenant_id", claims.tenant_id)
          .in("payment_id", paymentIds);

  if (matchError) {
    console.error(
      "[finance:bank-match-search] failed to load existing matches",
      matchError.code,
    );
    return { success: false, error: "Không tải được đơn chờ đối soát." };
  }

  const matchedIds = new Set(
    (matchRows ?? []).flatMap((row) =>
      row.payment_id == null ? [] : [row.payment_id],
    ),
  );

  const items: SepayMatchablePayment[] = pageRows.flatMap((row) => {
    if (matchedIds.has(row.id)) return [];
    if (row.status !== "pending" && row.status !== "completed") return [];
    const order = firstRelation(row.orders);
    if (order == null || order.status === "cancelled") return [];
    const branch = firstRelation(order.branches);
    return [
      {
        paymentId: row.id,
        paymentCode: order.payment_code,
        orderId: row.order_id,
        orderNumber: order.order_number,
        amount: Number(row.amount),
        status: row.status,
        createdAt: row.created_at,
        branchName: branch?.name ?? null,
      },
    ];
  });

  return { success: true, data: { items } };
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

  const { supabase, claims, user } = ctx;
  const order = await resolveOrderForBankMatch(
    supabase,
    claims.tenant_id,
    parsed.data.paymentCode,
  );
  if (!order.success || order.data == null) {
    return { success: false, error: order.error };
  }

  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("id, status")
    .eq("tenant_id", claims.tenant_id)
    .eq("order_id", order.data.id)
    .eq("method", "vietqr")
    .in("status", ["pending", "completed"])
    .limit(2);

  if (paymentsError || payments == null || payments.length !== 1) {
    return {
      success: false,
      error:
        "Không tìm thấy thanh toán VietQR đang chờ hoặc đã thu cho mã này.",
    };
  }

  const paymentId = payments[0]?.id;
  if (paymentId == null) {
    return {
      success: false,
      error:
        "Không tìm thấy thanh toán VietQR đang chờ hoặc đã thu cho mã này.",
    };
  }

  if (payments[0]?.status === "pending") {
    if (parsed.data.eventId == null) {
      return {
        success: false,
        error:
          "Chưa có bằng chứng SePay hợp lệ. Hãy gửi lại giao dịch từ cổng SePay trước khi khớp thanh toán.",
      };
    }

    const { data, error } = await createServiceClient().rpc(
      "replay_signed_sepay_payment_evidence",
      {
        p_actor_id: user.id,
        p_event_id: parsed.data.eventId,
        p_payment_code: order.data.paymentCode,
        p_payment_id: paymentId,
      },
    );

    if (error) {
      console.error(
        "[finance:bank-webhook-review] failed to replay signed payment evidence",
        error.code,
      );
      return { success: false, error: mapLinkPaymentError(error) };
    }

    revalidateSurfacePath("/finance");
    revalidateSurfacePath("/finance/bank-transactions");
    revalidateSurfacePath("/finance/invoices");
    return { success: true, data };
  }

  const canonicalResult =
    parsed.data.bankTransactionId == null
      ? null
      : await supabase.rpc("reconcile_bank_transaction_targets", {
          p_bank_transaction_id: parsed.data.bankTransactionId,
          p_target_type: "payment",
          p_target_ids: [paymentId],
        });
  const legacyResult =
    canonicalResult != null || parsed.data.eventId == null
      ? null
      : await (supabase as LinkPaymentRpcClient).rpc(
          "link_sepay_transaction_to_payment",
          {
            p_event_id: parsed.data.eventId,
            p_payment_id: paymentId,
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
