"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNDateString } from "@comtammatu/shared/time";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import type { Json } from "@comtammatu/database";

const FINANCE_ROLES: readonly StaffRole[] = ["owner"];

const transferCashSchema = z.object({
  amount: z.coerce
    .number()
    .min(1000, "Số tiền không hợp lệ")
    .max(100_000_000, "Số tiền quá lớn"),
  referenceCode: z.string().trim().optional(),
});

export async function transferCashToBank(
  input: z.infer<typeof transferCashSchema>,
): Promise<ActionResult> {
  const parsed = transferCashSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền." };
  const { supabase, claims } = ctx;

  const today = getVNDateString();
  const { amount, referenceCode } = parsed.data;

  // 1. Tạo expense category = 'bank_deposit', payment_method = 'cash'
  // Việc này sẽ làm giảm Tồn quỹ (cashOnHand) nhưng không ảnh hưởng Lợi nhuận (vì category != operating)
  const { data: expenseData, error: expenseError } = await supabase
    .from("expenses")
    .insert({
      tenant_id: claims.tenant_id,
      category: "bank_deposit",
      amount: amount,
      payment_method: "cash",
      expense_date: today,
      note: referenceCode
        ? `Nộp tiền mặt vào NH (Mã tham chiếu: ${referenceCode})`
        : "Nộp tiền mặt vào NH",
    })
    .select("id")
    .single();

  if (expenseError) {
    console.error("[finance:transfer] Failed to create expense", expenseError);
    return { success: false, error: "Không thể ghi nhận khoản giảm quỹ." };
  }

  // 2. Nếu KHÔNG có mã tham chiếu SePay, tự tạo webhook_events để tăng Bank Balance
  if (!referenceCode) {
    const payload = {
      gateway: "Manual",
      transactionDate: new Date().toISOString().replace("T", " ").substring(0, 19),
      accountNumber: "MANUAL",
      transferType: "in",
      transferAmount: amount,
      content: "Nộp tiền mặt",
      referenceCode: "MANUAL_" + Date.now(),
    };

    const { error: webhookError } = await supabase
      .from("webhook_events")
      .insert({
        tenant_id: claims.tenant_id,
        provider: "manual",
        request_id: "MANUAL_" + Date.now(),
        signature_valid: true,
        payload: payload as unknown as Json,
        processing_status: "processed",
        expense_id: expenseData.id,
      });

    if (webhookError) {
      console.error(
        "[finance:transfer] Failed to create manual webhook event",
        webhookError,
      );
      // Even if webhook fails, expense is already recorded, but we should notify user
      return {
        success: false,
        error: "Ghi giảm quỹ thành công, nhưng không thể cập nhật số dư ngân hàng.",
      };
    }
  }

  revalidateSurfacePath("/finance");
  return { success: true };
}
