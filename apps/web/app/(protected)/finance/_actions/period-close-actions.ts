"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  MODULE_ACL,
  PERMISSION_KEYS,
  type StaffRole,
} from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";
import { logAudit } from "@/_lib/audit";
import { fetchPeriodReadiness } from "../_lib/finance-period-readiness";

const FINANCE_ROLES = MODULE_ACL.finance.allowedRoles;
const OWNER_ONLY_ROLES: readonly StaffRole[] = ["owner"];

const closePeriodSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  acknowledgedWarnings: z.boolean().optional(),
});

const reopenPeriodSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  reason: z
    .string()
    .trim()
    .min(10, "Lý do mở lại sổ phải có ít nhất 10 ký tự")
    .max(500),
});

export const closeFinancePeriodSoftAction = withAction(
  {
    roles: FINANCE_ROLES,
    permission: PERMISSION_KEYS.ACCOUNTING_PERIOD_CLOSE,
    schema: closePeriodSchema,
  },
  async (data, { supabase, claims }) => {
    const readiness = await fetchPeriodReadiness({
      supabase,
      year: data.year,
      month: data.month,
      branchId: null,
    });

    if (!readiness) {
      return {
        success: false,
        error: "Không thể kiểm tra sức khoẻ chốt sổ kỳ này.",
      };
    }

    if (!readiness.canClose || readiness.blockerCount > 0) {
      return {
        success: false,
        error: "Kỳ kế toán còn lỗi chặn, chưa đủ điều kiện chốt sổ.",
      };
    }

    const { error } = await supabase.rpc("close_period_soft", {
      p_tenant_id: claims.tenant_id,
      p_year: data.year,
      p_month: data.month,
    });

    if (error) {
      console.error(
        "[finance/_actions/period-close-actions:closeFinancePeriodSoftAction] close_period_soft RPC failed",
        error.code,
      );
      return { success: false, error: "Không thể chốt sổ kỳ này." };
    }

    await logAudit(supabase, {
      action: "accounting.period_soft_close",
      entityType: "accounting_period",
      entityId: null,
      newData: {
        year: data.year,
        month: data.month,
        warningCount: readiness.warningCount,
        acknowledgedWarnings: data.acknowledgedWarnings ?? false,
      },
    });

    revalidatePath("/finance");
    return { success: true, data: { status: "soft_closed" } };
  },
);

export const closeFinancePeriodHardAction = withAction(
  {
    roles: OWNER_ONLY_ROLES,
    permission: PERMISSION_KEYS.ACCOUNTING_PERIOD_CLOSE,
    schema: closePeriodSchema,
  },
  async (data, { supabase, claims }) => {
    const readiness = await fetchPeriodReadiness({
      supabase,
      year: data.year,
      month: data.month,
      branchId: null,
    });

    if (!readiness) {
      return {
        success: false,
        error: "Không thể kiểm tra sức khoẻ chốt sổ kỳ này.",
      };
    }

    if (!readiness.canClose || readiness.blockerCount > 0) {
      return {
        success: false,
        error: "Kỳ kế toán còn lỗi chặn, chưa đủ điều kiện khóa sổ.",
      };
    }

    const { error } = await supabase.rpc("close_period_hard", {
      p_tenant_id: claims.tenant_id,
      p_year: data.year,
      p_month: data.month,
    });

    if (error) {
      console.error(
        "[finance/_actions/period-close-actions:closeFinancePeriodHardAction] close_period_hard RPC failed",
        error.code,
      );
      return { success: false, error: "Không thể khóa sổ kỳ này." };
    }

    await logAudit(supabase, {
      action: "accounting.period_hard_close",
      entityType: "accounting_period",
      entityId: null,
      newData: {
        year: data.year,
        month: data.month,
      },
    });

    revalidatePath("/finance");
    return { success: true, data: { status: "hard_closed" } };
  },
);

export const reopenFinancePeriodAction = withAction(
  {
    roles: OWNER_ONLY_ROLES,
    permission: PERMISSION_KEYS.ACCOUNTING_PERIOD_REOPEN,
    schema: reopenPeriodSchema,
  },
  async (data, { supabase, claims }) => {
    const { error } = await supabase.rpc("reopen_period", {
      p_tenant_id: claims.tenant_id,
      p_year: data.year,
      p_month: data.month,
    });

    if (error) {
      console.error(
        "[finance/_actions/period-close-actions:reopenFinancePeriodAction] reopen_period RPC failed",
        error.code,
      );
      return { success: false, error: "Không thể mở lại sổ kỳ này." };
    }

    await logAudit(supabase, {
      action: "accounting.period_reopen",
      entityType: "accounting_period",
      entityId: null,
      newData: {
        year: data.year,
        month: data.month,
        reason: data.reason,
      },
    });

    revalidatePath("/finance");
    return { success: true, data: { status: "open" } };
  },
);
