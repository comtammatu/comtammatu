"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";

const FINANCE_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

/* ─── Fetch Posting Rules ─── */

export async function fetchPostingRules(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    FINANCE_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("posting_rules")
    .select(
      "id, rule_code, description, transaction_type, debit_account_code, credit_account_code, is_active",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("transaction_type")
    .order("rule_code");

  if (error) {
    return { success: false, error: "Không thể tải quy tắc hạch toán." };
  }

  return { success: true, data: data ?? [] };
}

/* ─── Update Posting Rule ─── */

const updatePostingRuleSchema = z.object({
  id: z.coerce.number().int().positive(),
  debitAccountCode: z.string().min(1).max(10).optional(),
  creditAccountCode: z.string().min(1).max(10).optional(),
  isActive: z.boolean().optional(),
});

export async function updatePostingRule(
  input: z.infer<typeof updatePostingRuleSchema>,
): Promise<ActionResult> {
  const parsed = updatePostingRuleSchema.safeParse(input);
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
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const updatePayload: {
    debit_account_code?: string;
    credit_account_code?: string;
    is_active?: boolean;
  } = {};
  if (parsed.data.debitAccountCode !== undefined) {
    updatePayload.debit_account_code = parsed.data.debitAccountCode;
  }
  if (parsed.data.creditAccountCode !== undefined) {
    updatePayload.credit_account_code = parsed.data.creditAccountCode;
  }
  if (parsed.data.isActive !== undefined) {
    updatePayload.is_active = parsed.data.isActive;
  }

  if (Object.keys(updatePayload).length === 0) {
    return { success: false, error: "Không có thay đổi." };
  }

  // Validate account codes exist for this tenant before persisting
  const codesToValidate: string[] = [];
  if (parsed.data.debitAccountCode)
    codesToValidate.push(parsed.data.debitAccountCode);
  if (parsed.data.creditAccountCode)
    codesToValidate.push(parsed.data.creditAccountCode);

  if (codesToValidate.length > 0) {
    const { data: validAccounts, error: accountsError } = await supabase
      .from("chart_of_accounts")
      .select("account_code")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .in("account_code", codesToValidate);

    if (accountsError) {
      return { success: false, error: "Không thể xác minh mã tài khoản." };
    }

    const validCodes = new Set(
      (validAccounts ?? []).map(
        (a: { account_code: string }) => a.account_code,
      ),
    );
    for (const code of codesToValidate) {
      if (!validCodes.has(code)) {
        return {
          success: false,
          error: `Mã tài khoản "${code}" không tồn tại hoặc đã bị vô hiệu.`,
        };
      }
    }
  }

  const { data, error } = await supabase
    .from("posting_rules")
    .update(updatePayload)
    .eq("id", parsed.data.id)
    .eq("tenant_id", claims.tenant_id)
    .select("id")
    .maybeSingle();

  if (error) {
    return { success: false, error: "Không thể cập nhật quy tắc hạch toán." };
  }

  // RLS returns { data: null, error: null } on blocked writes
  if (!data) {
    return {
      success: false,
      error: "Không tìm thấy quy tắc hoặc không có quyền.",
    };
  }

  return { success: true };
}
