"use server";

import { z } from "zod";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../_lib/auth";

const FINANCE_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

/* ─── Fetch Posting Rules ─── */

export async function fetchPostingRules(): Promise<ActionResult> {
  const ctx = await getAuthContext(FINANCE_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // posting_rules table added in gl_posting_rules migration — cast until db:types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
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

  const ctx = await getAuthContext(FINANCE_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const updatePayload: Record<string, unknown> = {};
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

  // posting_rules table added in gl_posting_rules migration — cast until db:types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
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
    return { success: false, error: "Không tìm thấy quy tắc hoặc không có quyền." };
  }

  return { success: true };
}
