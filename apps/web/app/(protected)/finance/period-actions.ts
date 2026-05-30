"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";

/**
 * Role surface gate — who can reach the fiscal-periods surface at all.
 * Fine-grained authz is enforced via RLS (`fiscal_periods_*` policies) and
 * the `close_fiscal_period` / `gl_reconciliation` SECURITY DEFINER RPCs,
 * both guarded by Auth v2 permissions.
 */
const FINANCE_ROLES: readonly StaffRole[] = ["owner", "super_manager"];
const REPORT_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
];

/* ─── Fetch Fiscal Periods ─── */

export async function fetchFiscalPeriods(): Promise<ActionResult> {
  const ctx = await getAuthContextWithPermission(
    REPORT_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase
    .from("fiscal_periods")
    .select(
      "id, period_month, period_year, status, closed_by, closed_at, notes, created_at",
    )
    .eq("tenant_id", claims.tenant_id)
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false });

  if (error) {
    return { success: false, error: "Không thể tải danh sách kỳ kế toán." };
  }

  return { success: true, data: data ?? [] };
}

/* ─── Open Fiscal Period ─── */

const openPeriodSchema = z.object({
  year: z.coerce.number().int().min(2020),
  month: z.coerce.number().int().min(1).max(12),
});

export async function openFiscalPeriod(
  input: z.infer<typeof openPeriodSchema>,
): Promise<ActionResult> {
  const parsed = openPeriodSchema.safeParse(input);
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

  const { data, error } = await supabase
    .from("fiscal_periods")
    .upsert(
      {
        tenant_id: claims.tenant_id,
        period_month: parsed.data.month,
        period_year: parsed.data.year,
        status: "open",
      },
      { onConflict: "period_month,period_year,tenant_id" },
    )
    .select("id, period_month, period_year, status")
    .single();

  if (error) {
    return { success: false, error: "Không thể mở kỳ kế toán." };
  }

  // RLS returns { data: null, error: null } on blocked writes
  if (!data) {
    return { success: false, error: "Không có quyền mở kỳ kế toán." };
  }

  return { success: true, data };
}

/* ─── Close Fiscal Period ─── */

const closePeriodSchema = z.object({
  year: z.coerce.number().int().min(2020),
  month: z.coerce.number().int().min(1).max(12),
  notes: z.string().max(500).optional(),
});

export async function closeFiscalPeriod(
  input: z.infer<typeof closePeriodSchema>,
): Promise<ActionResult> {
  const parsed = closePeriodSchema.safeParse(input);
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

  const { data, error } = await supabase.rpc("close_fiscal_period", {
    p_tenant_id: claims.tenant_id,
    p_year: parsed.data.year,
    p_month: parsed.data.month,
    p_notes: parsed.data.notes ?? undefined,
  });

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("fiscal_period_not_found")) {
      return { success: false, error: "Kỳ kế toán chưa được tạo." };
    }
    if (msg.includes("fiscal_period_already_closed")) {
      return { success: false, error: "Kỳ kế toán đã đóng." };
    }
    return { success: false, error: "Không thể đóng kỳ kế toán." };
  }

  return { success: true, data };
}

/* ─── GL Reconciliation Report ─── */

const reconciliationSchema = z.object({
  year: z.coerce.number().int().min(2020),
  month: z.coerce.number().int().min(1).max(12),
});

export async function fetchReconciliation(
  input: z.infer<typeof reconciliationSchema>,
): Promise<ActionResult> {
  const parsed = reconciliationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    REPORT_ROLES,
    PERMISSION_KEYS.FINANCE_VIEW,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  const { data, error } = await supabase.rpc("gl_reconciliation", {
    p_tenant_id: claims.tenant_id,
    p_year: parsed.data.year,
    p_month: parsed.data.month,
  });

  if (error) {
    return { success: false, error: "Không thể tải báo cáo đối chiếu." };
  }

  return { success: true, data };
}
