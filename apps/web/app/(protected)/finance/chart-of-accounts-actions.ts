"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { withAction } from "@/_lib/with-action";

const COA_READ_ROLES: readonly StaffRole[] = ["owner", "super_manager"];
const COA_WRITE_ROLES: readonly StaffRole[] = ["owner", "super_manager"];

/* ─── Seed Chart of Accounts (auth-only) ─── */

export async function seedChartOfAccounts(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    COA_WRITE_ROLES,
    PERMISSION_KEYS.SETTINGS_TENANT,
  );
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

/* ─── Fetch Chart of Accounts (auth-only) ─── */

export async function fetchChartOfAccounts(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    COA_READ_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
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

/* ─── Schemas ─── */

const createAccountSchema = z.object({
  accountCode: z.string().min(1, "Mã tài khoản không được trống"),
  accountName: z.string().min(1, "Tên tài khoản không được trống"),
  accountType: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  parentId: z.coerce.number().int().positive().optional(),
  level: z.coerce.number().int().min(1).max(5).optional(),
});

const updateAccountSchema = z.object({
  id: z.coerce.number().int().positive(),
  accountName: z.string().min(1, "Tên tài khoản không được trống"),
  accountType: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  parentId: z.coerce.number().int().positive().nullable().optional(),
  level: z.coerce.number().int().min(1).max(5).optional(),
});

const toggleIdSchema = z.object({
  id: z.coerce.number().int().positive({ error: "Account ID không hợp lệ" }),
});

/* ─── Create Account ─── */

export const createAccount = withAction(
  {
    roles: COA_WRITE_ROLES,
    schema: createAccountSchema,
    permission: PERMISSION_KEYS.SETTINGS_TENANT,
  },
  async (data, { supabase, claims }) => {
    const { data: result, error } = await supabase
      .from("chart_of_accounts")
      .insert({
        tenant_id: claims.tenant_id,
        account_code: data.accountCode,
        account_name: data.accountName,
        account_type: data.accountType,
        parent_id: data.parentId ?? null,
        level: data.level ?? 1,
      })
      .select("id, account_code, account_name")
      .single();

    if (error) {
      if (error.code === "23505") {
        return { success: false, error: "Mã tài khoản đã tồn tại." };
      }
      return { success: false, error: "Không thể tạo tài khoản." };
    }

    return { success: true, data: result };
  },
);

/* ─── Update Account ─── */

export const updateAccount = withAction(
  {
    roles: COA_WRITE_ROLES,
    schema: updateAccountSchema,
    permission: PERMISSION_KEYS.SETTINGS_TENANT,
  },
  async (data, { supabase, claims }) => {
    const { error } = await supabase
      .from("chart_of_accounts")
      .update({
        account_name: data.accountName,
        account_type: data.accountType,
        parent_id: data.parentId ?? null,
        level: data.level,
      })
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      return { success: false, error: "Không thể cập nhật tài khoản." };
    }

    return { success: true };
  },
);

/* ─── Toggle Account Active ─── */

export const toggleAccountActive = withAction(
  {
    roles: COA_WRITE_ROLES,
    schema: toggleIdSchema,
    permission: PERMISSION_KEYS.SETTINGS_TENANT,
  },
  async (data, { supabase, claims }) => {
    const { data: account, error: fetchErr } = await supabase
      .from("chart_of_accounts")
      .select("id, is_active")
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id)
      .single();

    if (fetchErr || !account) {
      return { success: false, error: "Tài khoản không tồn tại." };
    }

    const { error } = await supabase
      .from("chart_of_accounts")
      .update({ is_active: !account.is_active })
      .eq("id", data.id)
      .eq("tenant_id", claims.tenant_id);

    if (error) {
      return { success: false, error: "Không thể thay đổi trạng thái." };
    }

    return { success: true, data: { is_active: !account.is_active } };
  },
);
