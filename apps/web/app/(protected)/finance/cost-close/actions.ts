"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { withAction } from "@/_lib/with-action";
import { messages } from "@lib/messages";

const ROLES = MODULE_ACL.finance.allowedRoles;
const periodSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2200),
  month: z.coerce.number().int().min(1).max(12),
});
const closeSchema = periodSchema.extend({
  waiverReason: z.string().trim().max(1000).nullable(),
  idempotencyKey: z.string().uuid(),
});

const reconciliationSchema = z.object({
  quantity_mismatches: z.coerce.number().int().nonnegative(),
  value_mismatches: z.coerce.number().int().nonnegative(),
  origin_mismatches: z.coerce.number().int().nonnegative(),
  total_quantity: z.coerce.number(),
  total_value: z.coerce.number(),
  is_reconciled: z.boolean(),
});

export type InventoryCostCloseStatus = {
  year: number;
  month: number;
  cutoverStatus: "inactive" | "shadow" | "active";
  blockers: string[];
  attention: string[];
  reconciled: string[];
  totalQuantity: number;
  totalValue: number;
  attentionCount: number;
  closed: boolean;
};

export async function getInventoryCostCloseStatus(
  year: number,
  month: number,
): Promise<ActionResult<InventoryCostCloseStatus>> {
  const period = periodSchema.safeParse({ year, month });
  if (!period.success) {
    return { success: false, error: "Kỳ khóa sổ không hợp lệ." };
  }
  const ctx = await getAuthContextWithPermission(
    ROLES,
    PERMISSION_KEYS.ACCOUNTING_PERIOD_CLOSE,
  );
  if (!ctx || ctx.claims.user_role !== "owner") {
    return { success: false, error: messages.finance.costClose.noAccess };
  }

  const { supabase, claims } = ctx;
  const start = `${period.data.year}-${String(period.data.month).padStart(2, "0")}-01T00:00:00+07:00`;
  const next =
    period.data.month === 12
      ? `${period.data.year + 1}-01-01T00:00:00+07:00`
      : `${period.data.year}-${String(period.data.month + 1).padStart(2, "0")}-01T00:00:00+07:00`;
  const [
    reconciliationResult,
    cutoverResult,
    accountResult,
    originResult,
    pendingBalanceResult,
    snapshotResult,
  ] =
    await Promise.all([
      supabase.rpc("get_inventory_valuation_reconciliation", {
        p_year: period.data.year,
        p_month: period.data.month,
        p_branch_id: undefined,
      }),
      supabase
        .from("inventory_valuation_cutovers")
        .select("status, cutoff_at")
        .eq("tenant_id", claims.tenant_id)
        .maybeSingle(),
      supabase
        .from("inventory_valuation_accounts")
        .select("quantity, book_value")
        .eq("tenant_id", claims.tenant_id),
      supabase
        .from("inventory_cost_origins")
        .select("cost_status")
        .eq("tenant_id", claims.tenant_id)
        .eq("source_kind", "grn_receipt")
        .gte("effective_at", start)
        .lt("effective_at", next)
        .in("cost_status", ["pending", "provisional", "partial"]),
      supabase
        .from("inventory_origin_balances")
        .select(
          "id, inventory_cost_origins!inner(cost_status)",
          { count: "exact", head: true },
        )
        .eq("tenant_id", claims.tenant_id)
        .gt("quantity", 0)
        .eq("inventory_cost_origins.cost_status", "pending"),
      supabase
        .from("inventory_cost_close_snapshots")
        .select("id")
        .eq("tenant_id", claims.tenant_id)
        .eq("year", period.data.year)
        .eq("month", period.data.month)
        .maybeSingle(),
    ]);

  if (
    reconciliationResult.error ||
    cutoverResult.error ||
    accountResult.error ||
    originResult.error ||
    pendingBalanceResult.error ||
    snapshotResult.error
  ) {
    console.error("finance.inventory_cost_close.load_failed", {
      reconciliationCode: reconciliationResult.error?.code,
      cutoverCode: cutoverResult.error?.code,
      accountCode: accountResult.error?.code,
      originCode: originResult.error?.code,
      pendingBalanceCode: pendingBalanceResult.error?.code,
      snapshotCode: snapshotResult.error?.code,
    });
    return { success: false, error: messages.finance.costClose.loadFailed };
  }

  const reconciliation = reconciliationSchema.safeParse(
    reconciliationResult.data,
  );
  if (!reconciliation.success) {
    return { success: false, error: messages.finance.costClose.loadFailed };
  }
  const cutoverStatus =
    cutoverResult.data?.status === "active" ||
    cutoverResult.data?.status === "shadow"
      ? cutoverResult.data.status
      : "inactive";
  const accounts = accountResult.data ?? [];
  const zeroCostCount = accounts.filter(
    (account) =>
      Number(account.quantity) > 0 && Number(account.book_value) <= 0,
  ).length;
  const residualCount = accounts.filter(
    (account) =>
      Number(account.quantity) === 0 && Number(account.book_value) !== 0,
  ).length;
  const blockers: string[] = [];
  if (cutoverStatus !== "active") {
    blockers.push(
      cutoverStatus === "shadow"
        ? "Sổ giá trị đang ở chế độ shadow, chưa được kích hoạt."
        : "Chưa chuẩn bị và kích hoạt sổ giá trị tồn kho.",
    );
  }
  if (!reconciliation.data.is_reconciled) {
    blockers.push(
      `Đối soát còn lệch: ${reconciliation.data.quantity_mismatches} số lượng, ${reconciliation.data.value_mismatches} giá trị, ${reconciliation.data.origin_mismatches} nguồn giá.`,
    );
  }
  if (zeroCostCount > 0) {
    blockers.push(`${zeroCostCount} pool tồn dương nhưng không có giá trị.`);
  }
  if (residualCount > 0) {
    blockers.push(`${residualCount} pool đã hết số lượng nhưng còn giá trị.`);
  }
  if ((pendingBalanceResult.count ?? 0) > 0) {
    blockers.push(
      `${pendingBalanceResult.count ?? 0} nguồn giá đang chờ bổ sung nhưng vẫn còn tồn.`,
    );
  }

  const attentionCount = originResult.data?.length ?? 0;
  const attention =
    attentionCount > 0
      ? [
          `${attentionCount} nguồn nhập trong kỳ chưa có hóa đơn quyết toán đầy đủ; cần lý do chấp nhận khi khóa.`,
        ]
      : [];
  const reconciled = [
    `Tổng lượng trên sổ giá trị: ${reconciliation.data.total_quantity}.`,
    `Tổng giá trị tồn hiện tại: ${reconciliation.data.total_value}.`,
    ...(snapshotResult.data ? ["Kỳ đã được khóa và lưu bản chốt."] : []),
  ];

  return {
    success: true,
    data: {
      ...period.data,
      cutoverStatus,
      blockers,
      attention,
      reconciled,
      totalQuantity: reconciliation.data.total_quantity,
      totalValue: reconciliation.data.total_value,
      attentionCount,
      closed: snapshotResult.data != null,
    },
  };
}

export const closeInventoryCostPeriod = withAction(
  {
    roles: ROLES,
    schema: closeSchema,
    permission: PERMISSION_KEYS.ACCOUNTING_PERIOD_CLOSE,
    forbiddenError: messages.finance.costClose.noAccess,
  },
  async (input, { supabase, claims }) => {
    if (claims.user_role !== "owner") {
      return { success: false, error: messages.finance.costClose.noAccess };
    }
    const { data, error } = await supabase.rpc(
      "close_inventory_cost_period",
      {
        p_year: input.year,
        p_month: input.month,
        p_waiver_reason: input.waiverReason ?? "",
        p_idempotency_key: input.idempotencyKey,
      },
    );
    if (error) {
      const known: Record<string, string> = {
        inventory_valuation_not_active:
          "Sổ giá trị chưa được kích hoạt.",
        inventory_valuation_reconciliation_failed:
          "Đối soát còn chênh lệch, chưa thể khóa kỳ.",
        inventory_valuation_zero_cost_stock:
          "Còn tồn kho dương chưa có giá trị.",
        inventory_valuation_cost_pending:
          "Còn nguồn giá đang chờ bổ sung.",
        inventory_valuation_zero_quantity_residual:
          "Còn giá trị treo ở pool đã hết số lượng.",
        inventory_valuation_movement_unposted:
          "Còn biến động kho chưa ghi vào sổ giá trị.",
        inventory_cost_close_waiver_required:
          "Cần nhập lý do cho các phiếu nhập chưa quyết toán hóa đơn.",
      };
      const mapped = Object.entries(known).find(([code]) =>
        error.message.includes(code),
      )?.[1];
      return {
        success: false,
        error: mapped ?? messages.finance.costClose.closeFailed,
      };
    }
    revalidatePath("/finance/cost-close");
    revalidatePath("/finance");
    return { success: true, data };
  },
);
