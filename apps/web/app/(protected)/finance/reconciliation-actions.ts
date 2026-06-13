"use server";

import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";

const RECONCILIATION_ROLES: readonly StaffRole[] = ["owner"];

const CATEGORY_VALUES = [
  "sales",
  "cogs",
  "inventory_in",
  "payroll",
  "ap_payment",
] as const;

export type ReconciliationCategory = (typeof CATEGORY_VALUES)[number];

export interface ReconciliationCategoryRow {
  category: ReconciliationCategory;
  label: string;
  subledger_total: number | null;
  gl_total: number | null;
  difference: number | null;
  branch_scoped: boolean;
}

export interface ReconciliationReport {
  tenant_id: number;
  branch_id: number | null;
  start_date: string;
  end_date: string;
  generated_at: string;
  categories: ReconciliationCategoryRow[];
}

export interface ReconciliationDrilldownRow {
  ref_id: number;
  ref_label: string;
  ref_date: string;
  branch_id: number | null;
  amount: number;
  description: string | null;
}

const reconcileSchema = z
  .object({
    branchId: z.number().int().positive().nullable(),
    startDate: z.string().date("Ngày bắt đầu không hợp lệ (YYYY-MM-DD)"),
    endDate: z.string().date("Ngày kết thúc không hợp lệ (YYYY-MM-DD)"),
  })
  .refine((d) => d.startDate <= d.endDate, {
    error: "Ngày bắt đầu phải trước ngày kết thúc",
    path: ["endDate"],
  });

const drilldownSchema = reconcileSchema.safeExtend({
  category: z.enum(CATEGORY_VALUES),
  side: z.enum(["subledger", "gl"]),
  limit: z.number().int().min(1).max(1000).optional(),
});

export const fetchReconciliation = withAction(
  {
    roles: RECONCILIATION_ROLES,
    schema: reconcileSchema,
    permission: PERMISSION_KEYS.FINANCE_VIEW,
  },
  async (data, { supabase, claims }) => {
    const { data: result, error } = await supabase.rpc("fn_reconcile_period", {
      p_tenant_id: claims.tenant_id,
      p_start_date: data.startDate,
      p_end_date: data.endDate,
      p_branch_id: data.branchId ?? undefined,
    });

    if (error) {
      if (error.code === "22023") {
        return { success: false, error: "Khoảng ngày không hợp lệ." };
      }
      return { success: false, error: "Không thể tải dữ liệu đối chiếu." };
    }

    return { success: true, data: result as unknown as ReconciliationReport };
  },
);

export const fetchReconciliationDrilldown = withAction(
  {
    roles: RECONCILIATION_ROLES,
    schema: drilldownSchema,
    permission: PERMISSION_KEYS.FINANCE_VIEW,
  },
  async (data, { supabase, claims }) => {
    const { data: rows, error } = await supabase.rpc("fn_reconcile_drilldown", {
      p_tenant_id: claims.tenant_id,
      p_start_date: data.startDate,
      p_end_date: data.endDate,
      p_category: data.category,
      p_side: data.side,
      p_branch_id: data.branchId ?? undefined,
      p_limit: data.limit ?? 200,
    });

    if (error) {
      if (error.code === "22023") {
        return { success: false, error: "Tham số drilldown không hợp lệ." };
      }
      return { success: false, error: "Không thể tải chi tiết đối chiếu." };
    }

    return {
      success: true,
      data: (rows ?? []) as unknown as ReconciliationDrilldownRow[],
    };
  },
);
