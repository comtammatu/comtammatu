"use server";

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { parseMoneyToMinorUnits } from "@comtammatu/shared/money";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNDateString, getVNDayUtcRange } from "@comtammatu/shared/time";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";

const FINANCE_ROLES = MODULE_ACL.finance.allowedRoles;
const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FUND_MINOR_UNITS = 999_999_999_999_999n;
const MONEY = /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/;
const SIGNED_MONEY = /^-?(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/;
const requiredFundAmount = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === "" ? undefined : value,
  z
    .string()
    .trim()
    .regex(MONEY, "Số tiền không hợp lệ")
    .refine(
      (value) => parseMoneyToMinorUnits(value) <= MAX_FUND_MINOR_UNITS,
      "Số tiền vượt ngưỡng hợp lệ",
    ),
);
const fundDelta = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? "0" : value),
  z
    .string()
    .trim()
    .regex(SIGNED_MONEY, "Số tiền điều chỉnh không hợp lệ")
    .refine((value) => {
      const amount = parseMoneyToMinorUnits(value);
      return amount >= -MAX_FUND_MINOR_UNITS && amount <= MAX_FUND_MINOR_UNITS;
    }, "Số tiền điều chỉnh vượt ngưỡng hợp lệ"),
);

const initializeFinanceFundsSchema = z.object({
  bankBalance: requiredFundAmount,
  boundaryMode: z.enum(["cutover_now", "project_start_day"]),
  date: z.string().regex(BUSINESS_DATE, "Ngày mở sổ không hợp lệ"),
  reason: z.string().trim().min(5, "Cần ghi nguồn số hoặc ghi chú").max(500),
  confirmed: z.boolean().refine(Boolean, "Cần xác nhận trước khi lưu"),
  idempotencyKey: z.string().uuid(),
});

const initializeBranchCashOpeningSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  balance: requiredFundAmount,
  boundaryMode: z.enum(["cutover_now", "project_start_day"]),
  date: z.string().regex(BUSINESS_DATE, "Ngày mở sổ không hợp lệ"),
  reason: z.string().trim().min(5, "Cần ghi nguồn số hoặc ghi chú").max(500),
  confirmed: z.boolean().refine(Boolean, "Cần xác nhận trước khi lưu"),
  idempotencyKey: z.string().uuid(),
});

const createFinanceFundAdjustmentSchema = z
  .object({
    cashDelta: fundDelta,
    bankDelta: fundDelta,
    branchId: z.coerce.number().int().positive().nullable().optional(),
    reason: z.string().trim().min(5, "Cần ghi rõ lý do và bằng chứng").max(500),
    confirmed: z.boolean().refine(Boolean, "Cần xác nhận bút toán điều chỉnh"),
    idempotencyKey: z.string().uuid(),
  })
  .superRefine((value, ctx) => {
    const cash = parseMoneyToMinorUnits(value.cashDelta);
    const bank = parseMoneyToMinorUnits(value.bankDelta);
    if (cash === 0n && bank === 0n) {
      ctx.addIssue({
        code: "custom",
        message: "Cần nhập ít nhất một khoản điều chỉnh khác 0",
        path: ["cashDelta"],
      });
    }
    if (cash !== 0n && bank !== 0n) {
      ctx.addIssue({
        code: "custom",
        message: "Điều chỉnh tiền mặt và tiền tài khoản phải ghi riêng",
        path: ["cashDelta"],
      });
    }
    if (cash !== 0n && (value.branchId == null || value.branchId <= 0)) {
      ctx.addIssue({
        code: "custom",
        message: "Chọn chi nhánh khi điều chỉnh tiền mặt",
        path: ["branchId"],
      });
    }
  });

function financeFundError(
  error: { code?: string; message?: string },
  operation: "opening" | "adjustment",
): string {
  const message = error.message?.toLowerCase() ?? "";

  if (error.code === "42501" || message.includes("forbidden_owner_only")) {
    return "Không có quyền ghi nhận số dư theo sổ.";
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
  if (message.includes("finance_cash_branch_invalid")) {
    return "Chọn chi nhánh bán hàng.";
  }
  if (message.includes("finance_fund_adjustment_mixed_scope")) {
    return "Điều chỉnh tiền mặt và tiền tài khoản phải ghi riêng.";
  }
  if (message.includes("finance_fund_cash_requires_branch")) {
    return "Tiền mặt phải mở theo chi nhánh bán hàng.";
  }

  console.error("[finance:funds] write failed", operation, error.code);
  return operation === "opening"
    ? "Không thể mở sổ quỹ."
    : "Không thể điều chỉnh số dư.";
}

function openingEffectiveAt(
  boundaryMode: "cutover_now" | "project_start_day",
  date: string,
): string | null {
  return boundaryMode === "project_start_day"
    ? getVNDayUtcRange(date).startIso
    : null;
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
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền." };

  const { error } = await ctx.supabase.rpc("initialize_finance_funds", {
    p_bank_opening: parsed.data.bankBalance as unknown as number,
    p_cash_opening: 0 as unknown as number,
    p_effective_at: openingEffectiveAt(
      parsed.data.boundaryMode,
      parsed.data.date,
    ) as string,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return { success: false, error: financeFundError(error, "opening") };
  }

  revalidateSurfacePath("/finance");
  return { success: true };
}

export async function initializeBranchCashOpening(
  input: unknown,
): Promise<ActionResult> {
  const parsed = initializeBranchCashOpeningSchema.safeParse(input);
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
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền." };

  const { error } = await ctx.supabase.rpc("initialize_branch_cash_opening", {
    p_branch_id: parsed.data.branchId,
    p_cash_opening: parsed.data.balance as unknown as number,
    p_effective_at: openingEffectiveAt(
      parsed.data.boundaryMode,
      parsed.data.date,
    ) as string,
    p_reason: parsed.data.reason,
    p_idempotency_key: parsed.data.idempotencyKey,
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
    FINANCE_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền." };

  const cashDelta = parseMoneyToMinorUnits(parsed.data.cashDelta);
  const { error } = await ctx.supabase.rpc("create_finance_fund_adjustment", {
    p_bank_delta: parsed.data.bankDelta as unknown as number,
    p_cash_delta: parsed.data.cashDelta as unknown as number,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_reason: parsed.data.reason,
    p_branch_id: cashDelta === 0n ? undefined : (parsed.data.branchId ?? undefined),
  });
  if (error) {
    return { success: false, error: financeFundError(error, "adjustment") };
  }

  revalidateSurfacePath("/finance");
  return { success: true };
}
