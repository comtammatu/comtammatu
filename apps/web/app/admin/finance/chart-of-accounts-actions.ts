"use server";

import { z } from "zod";
import type { StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../_lib/auth";

const COA_READ_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
];
const COA_WRITE_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

/* ─── Seed Chart of Accounts ─── */

export async function seedChartOfAccounts(): Promise<ActionResult> {
  const ctx = await getAuthContext(COA_WRITE_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { error } = await supabase.rpc("seed_chart_of_accounts", {
    p_tenant_id: claims.tenant_id,
  });

  if (error) {
    return { success: false, error: "Không thể khởi tạo hệ thống tài khoản." };
  }

  return { success: true };
}

/* ─── Fetch Chart of Accounts ─── */

export async function fetchChartOfAccounts(): Promise<ActionResult> {
  const ctx = await getAuthContext(COA_READ_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("*")
    .eq("tenant_id", claims.tenant_id)
    .order("account_code");

  if (error) {
    return { success: false, error: "Không thể tải hệ thống tài khoản." };
  }

  return { success: true, data: data ?? [] };
}

/* ─── Create Account ─── */

const createAccountSchema = z.object({
  accountCode: z.string().min(1, "Mã tài khoản không được trống"),
  accountName: z.string().min(1, "Tên tài khoản không được trống"),
  accountType: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  parentId: z.coerce.number().int().positive().optional(),
  level: z.coerce.number().int().min(1).max(5).optional(),
});

export async function createAccount(
  input: z.infer<typeof createAccountSchema>,
): Promise<ActionResult> {
  const parsed = createAccountSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(COA_WRITE_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("chart_of_accounts")
    .insert({
      tenant_id: claims.tenant_id,
      account_code: parsed.data.accountCode,
      account_name: parsed.data.accountName,
      account_type: parsed.data.accountType,
      parent_id: parsed.data.parentId ?? null,
      level: parsed.data.level ?? 1,
    })
    .select("id, account_code, account_name")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Mã tài khoản đã tồn tại." };
    }
    return { success: false, error: "Không thể tạo tài khoản." };
  }

  return { success: true, data };
}

/* ─── Update Account ─── */

const updateAccountSchema = z.object({
  id: z.coerce.number().int().positive(),
  accountName: z.string().min(1, "Tên tài khoản không được trống"),
  accountType: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  parentId: z.coerce.number().int().positive().nullable().optional(),
  level: z.coerce.number().int().min(1).max(5).optional(),
});

export async function updateAccount(
  input: z.infer<typeof updateAccountSchema>,
): Promise<ActionResult> {
  const parsed = updateAccountSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContext(COA_WRITE_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { error } = await supabase
    .from("chart_of_accounts")
    .update({
      account_name: parsed.data.accountName,
      account_type: parsed.data.accountType,
      parent_id: parsed.data.parentId ?? null,
      level: parsed.data.level,
    })
    .eq("id", parsed.data.id)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể cập nhật tài khoản." };
  }

  return { success: true };
}

/* ─── Toggle Account Active ─── */

export async function toggleAccountActive(
  accountId: number,
): Promise<ActionResult> {
  const parsedId = z.coerce.number().int().positive().safeParse(accountId);
  if (!parsedId.success) {
    return { success: false, error: "Account ID không hợp lệ" };
  }

  const ctx = await getAuthContext(COA_WRITE_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Fetch current state
  const { data: account, error: fetchErr } = await supabase
    .from("chart_of_accounts")
    .select("id, is_active")
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id)
    .single();

  if (fetchErr || !account) {
    return { success: false, error: "Tài khoản không tồn tại." };
  }

  const { error } = await supabase
    .from("chart_of_accounts")
    .update({ is_active: !account.is_active })
    .eq("id", parsedId.data)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể thay đổi trạng thái." };
  }

  return { success: true, data: { is_active: !account.is_active } };
}
