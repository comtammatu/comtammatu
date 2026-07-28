"use server";

import { z } from "zod";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNDateString, getVNDayUtcRange } from "@comtammatu/shared/time";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";

/** Fund bootstrap / privileged ledger writes stay Owner-only. */
const OWNER_FUND_ROLES = ["owner"] as const;
const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FUND_AMOUNT = 100_000_000_000;
const requiredFundAmount = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z.coerce.number().min(0).max(MAX_FUND_AMOUNT),
);

const initializeFinanceFundsSchema = z.object({
  balance: requiredFundAmount,
  bankBalance: requiredFundAmount,
  boundaryMode: z.enum(["cutover_now", "project_start_day"]),
  date: z.string().regex(BUSINESS_DATE, "Ngày mở sổ không hợp lệ"),
  reason: z.string().trim().min(5, "Cần ghi nguồn số hoặc ghi chú").max(500),
  confirmed: z.boolean().refine(Boolean, "Cần xác nhận trước khi lưu"),
  idempotencyKey: z.string().uuid(),
});

const createFinanceFundAdjustmentSchema = z
  .object({
    cashDelta: z.coerce.number().min(-MAX_FUND_AMOUNT).max(MAX_FUND_AMOUNT),
    bankDelta: z.coerce.number().min(-MAX_FUND_AMOUNT).max(MAX_FUND_AMOUNT),
    reason: z.string().trim().min(5, "Cần ghi rõ lý do và bằng chứng").max(500),
    confirmed: z.boolean().refine(Boolean, "Cần xác nhận bút toán điều chỉnh"),
    idempotencyKey: z.string().uuid(),
  })
  .refine(({ cashDelta, bankDelta }) => cashDelta !== 0 || bankDelta !== 0, {
    message: "Cần nhập ít nhất một khoản điều chỉnh khác 0",
    path: ["cashDelta"],
  });

function financeFundError(
  error: { code?: string; message?: string },
  operation: "opening" | "adjustment",
): string {
  const message = error.message?.toLowerCase() ?? "";

  if (error.code === "42501" || message.includes("forbidden_owner_only")) {
    return "Chỉ Owner mới được ghi nhận số dư theo sổ.";
  }
  if (message.includes("finance_fund_idempotency_conflict")) {
    return "Yêu cầu này đã được dùng với dữ liệu khác. Hãy đóng và mở lại biểu mẫu.";
  }
  if (message.includes("finance_funds_already_initialized")) {
    return "Số dư đầu đã được ghi và không thể thay đổi.";
  }
  if (message.includes("finance_fund_legacy_cutover_required")) {
    return "Có số dư cũ chưa chốt. Liên hệ hỗ trợ trước khi mở sổ mới.";
  }
  if (message.includes("finance_funds_not_initialized")) {
    return "Cần nhập số dư đầu trước khi điều chỉnh.";
  }

  console.error("[finance:funds] write failed", operation, error.code);
  return operation === "opening"
    ? "Không thể mở sổ quỹ."
    : "Không thể điều chỉnh số dư.";
}

export async function initializeFinanceFunds(
  input: unknown,
): Promise<ActionResult> {
  const parsed = initializeFinanceFundsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  if (
    parsed.data.boundaryMode === "project_start_day" &&
    parsed.data.date > getVNDateString()
  ) {
    return { success: false, error: "Ngày mở sổ không thể ở tương lai." };
  }

  const ctx = await getAuthContextWithPermission(
    OWNER_FUND_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền." };

  const { error } = await ctx.supabase.rpc("initialize_finance_funds", {
    p_bank_opening: parsed.data.bankBalance,
    p_cash_opening: parsed.data.balance,
    p_effective_at: (parsed.data.boundaryMode === "project_start_day"
      ? getVNDayUtcRange(parsed.data.date).startIso
      : null) as string,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return { success: false, error: financeFundError(error, "opening") };
  }

  revalidateSurfacePath("/finance");
  return { success: true };
}

export async function createFinanceFundAdjustment(
  input: unknown,
): Promise<ActionResult> {
  const parsed = createFinanceFundAdjustmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    OWNER_FUND_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền." };

  const { error } = await ctx.supabase.rpc("create_finance_fund_adjustment", {
    p_bank_delta: parsed.data.bankDelta,
    p_cash_delta: parsed.data.cashDelta,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return { success: false, error: financeFundError(error, "adjustment") };
  }

  revalidateSurfacePath("/finance");
  return { success: true };
}
