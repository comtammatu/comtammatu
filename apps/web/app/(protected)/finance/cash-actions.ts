"use server";

/**
 * Cash-book opening anchor (D028 deliverable 3).
 *
 * Owner counts physical cash on a chosen date and stores it as the running-quỹ
 * anchor in system_settings. `fetchCashSummary` adds cash collected and
 * subtracts cash spent from this date to derive tiền mặt hiện hữu.
 */

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { SYSTEM_SETTING_KEYS } from "@comtammatu/shared/settings";
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
  const { supabase, claims } = ctx;

  const entries: Array<[string, string]> = [
    [SYSTEM_SETTING_KEYS.CASH_OPENING_BALANCE, String(parsed.data.balance)],
    [SYSTEM_SETTING_KEYS.CASH_OPENING_DATE, parsed.data.date],
  ];
  for (const [key, value] of entries) {
    const { error } = await supabase
      .from("system_settings")
      .upsert(
        { tenant_id: claims.tenant_id, key, value },
        { onConflict: "key,tenant_id" },
      );
    if (error) {
      return { success: false, error: "Không thể lưu tồn quỹ." };
    }
  }

  revalidateSurfacePath("/finance");
  return { success: true };
}
