"use server";

/**
 * Cash-book opening anchor (D028 deliverable 3).
 *
 * Owner counts physical cash and bank-account balance on a chosen date and
 * stores them as running-balance anchors in system_settings (both share one
 * anchor date). `fetchCashSummary` adds collected money and subtracts paid
 * expenses from this date to derive on-hand cash and bank balance.
 */

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNDateString } from "@comtammatu/shared/time";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";

const FINANCE_ROLES: readonly StaffRole[] = ["owner"];
const BUSINESS_DATE = /^\d{4}-\d{2}-\d{2}$/;

const setCashOpeningSchema = z.object({
  balance: z.coerce
    .number()
    .min(0, "Số dư không hợp lệ")
    .max(100_000_000_000, "Số dư quá lớn"),
  bankBalance: z.coerce
    .number()
    .min(0, "Số dư ngân hàng không hợp lệ")
    .max(100_000_000_000, "Số dư quá lớn"),
  date: z.string().regex(BUSINESS_DATE, "Ngày không hợp lệ"),
});

export async function setCashOpening(
  input: z.infer<typeof setCashOpeningSchema>,
): Promise<ActionResult> {
  const parsed = setCashOpeningSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const today = getVNDateString();
  if (parsed.data.date > today) {
    return { success: false, error: "Ngày tồn quỹ không thể ở tương lai." };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền." };
  const { supabase } = ctx;

  const { error } = await supabase.rpc("set_finance_cash_opening", {
    p_bank_balance: parsed.data.bankBalance,
    p_cash_balance: parsed.data.balance,
    p_opening_date: parsed.data.date,
  });
  if (error) {
    return { success: false, error: "Không thể lưu tồn quỹ." };
  }

  revalidateSurfacePath("/finance");
  return { success: true };
}
