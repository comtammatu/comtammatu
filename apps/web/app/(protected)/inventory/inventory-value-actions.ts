"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { messages } from "@lib/messages";
import { loadInventoryMonetaryAccess } from "@lib/inventory/monetary-access";
import { getAuthContextWithPermission } from "./_lib/auth";
import { getBranchSiteDisplayName } from "./_lib/branch-site-labels";
import { fetchStockBearingLocationIds } from "./_lib/stock-bearing-locations";

const SYSTEM_ROLES: readonly StaffRole[] = ["owner"];

const BRANCH_ROLES: readonly StaffRole[] = ["owner", "accountant"];

const inventoryPeriodValueSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
  branchId: z.number().int().positive().optional(),
});

const inventoryValuationRestoreSchema = z.object({
  idempotencyKey: z.string().uuid(),
});

function computeLineValue(
  qty: number,
  avgUnitCost: number | null | undefined,
): number {
  const unit = avgUnitCost != null ? Number(avgUnitCost) : 0;
  return Number(qty) * unit;
}

async function isValuationActive(
  supabase: NonNullable<
    Awaited<ReturnType<typeof loadInventoryMonetaryAccess>>["client"]
  >,
  tenantId: number,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("inventory_valuation_cutovers")
    .select("status")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return !error && data?.status === "active";
}

export async function restoreInventoryValuationFromSupplierInvoices(
  input: { idempotencyKey: string },
): Promise<ActionResult<void>> {
  const parsed = inventoryValuationRestoreSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Không thể khôi phục giá trị tồn kho." };
  }

  const ctx = await getAuthContextWithPermission(
    SYSTEM_ROLES,
    PERMISSION_KEYS.INVENTORY_VALUATION_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { error } = await ctx.supabase.rpc(
    "prepare_inventory_valuation_cutover",
    { p_idempotency_key: parsed.data.idempotencyKey },
  );
  if (error) {
    console.error("[inventory:valuation-restore] RPC failed", error.code);
    const message = error.message ?? "";
    if (message.includes("inventory_valuation_bootstrap_missing_invoice_coverage")) {
      return {
        success: false,
        error: "Còn tồn kho chưa có giá từ HĐ NCC đã xác nhận.",
      };
    }
    return {
      success: false,
      error: "Không thể khôi phục giá trị tồn kho. Vui lòng thử lại.",
    };
  }

  revalidatePath("/inventory");
  revalidatePath("/inventory/stock");
  return { success: true };
}

export async function fetchInventoryValueSystem(
  branchId?: number,
): Promise<ActionResult<{ totalValue: number }>> {
  const ctx = await getAuthContextWithPermission(
    SYSTEM_ROLES,
    PERMISSION_KEYS.INVENTORY_VALUATION_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { claims } = ctx;
  const monetaryAccess = await loadInventoryMonetaryAccess(claims.user_role);
  if (!monetaryAccess.systemValuation || !monetaryAccess.client) {
    return { success: false, error: "Không có quyền" };
  }
  const supabase = monetaryAccess.client;
  const stockBearingLocations = await fetchStockBearingLocationIds({
    supabase,
    tenantId: claims.tenant_id,
    ...(branchId != null ? { branchId } : {}),
  });

  if (!stockBearingLocations.ok) {
    return {
      success: false,
      error: messages.inventory.value.stockLoadFailed,
    };
  }

  if (stockBearingLocations.locationIds.length === 0) {
    return { success: true, data: { totalValue: 0 } };
  }

  const valuationActive = await isValuationActive(
    supabase,
    claims.tenant_id,
  );
  let query = valuationActive
    ? supabase
        .from("inventory_valuation_accounts")
        .select("branch_id, location_id, quantity, book_value")
        .eq("tenant_id", claims.tenant_id)
        .in("location_id", stockBearingLocations.locationIds)
    : supabase
        .from("stock_levels")
        .select("branch_id, location_id, current_quantity, avg_unit_cost")
        .eq("tenant_id", claims.tenant_id)
        .in("location_id", stockBearingLocations.locationIds);

  if (branchId != null) {
    query = query.eq("branch_id", branchId);
  }

  const { data, error } = await query;

  if (error) {
    return {
      success: false,
      error: messages.inventory.value.calculateFailed,
    };
  }

  let totalValue = 0;
  for (const row of data ?? []) {
    totalValue +=
      "book_value" in row
        ? Number(row.book_value)
        : computeLineValue(
            Number(row.current_quantity),
            row.avg_unit_cost != null ? Number(row.avg_unit_cost) : null,
          );
  }

  return { success: true, data: { totalValue } };
}

export interface BranchValueRow {
  branchId: number;
  branchName: string;
  totalValue: number;
}

interface InventoryPeriodValueRpcRow {
  branch_id: number;
  opening_value: number | string | null;
  closing_value: number | string | null;
}

type InventoryPeriodValueRpcClient = {
  rpc: (
    fn:
      | "get_inventory_value_period"
      | "get_inventory_valuation_period_value",
    args: {
      p_start_date: string;
      p_end_date: string;
      p_branch_id: number | null;
    },
  ) => PromiseLike<{
    data: InventoryPeriodValueRpcRow[] | null;
    error: { code?: string } | null;
  }>;
};

export async function fetchInventoryPeriodValue(input: {
  startDate: string;
  endDate: string;
  branchId?: number;
}): Promise<ActionResult<{ openingValue: number; closingValue: number }>> {
  const parsed = inventoryPeriodValueSchema.safeParse(input);
  if (!parsed.success || parsed.data.startDate > parsed.data.endDate) {
    return { success: false, error: "Khoảng ngày không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    BRANCH_ROLES,
    PERMISSION_KEYS.INVENTORY_VALUATION_READ,
    parsed.data.branchId,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  if (ctx.claims.user_role !== "owner" && parsed.data.branchId == null) {
    return { success: false, error: "Không có quyền" };
  }

  const { data: cutover, error: cutoverError } = await ctx.supabase
    .from("inventory_valuation_cutovers")
    .select("status")
    .eq("tenant_id", ctx.claims.tenant_id)
    .maybeSingle();
  if (cutoverError) {
    console.error("[inventory:value-period] cutover lookup failed", cutoverError.code);
    return {
      success: false,
      error: messages.inventory.value.calculateFailed,
    };
  }
  const rpcName =
    cutover?.status === "active"
      ? "get_inventory_valuation_period_value"
      : "get_inventory_value_period";
  const { data, error } = await (
    ctx.supabase as unknown as InventoryPeriodValueRpcClient
  ).rpc(rpcName, {
    p_start_date: parsed.data.startDate,
    p_end_date: parsed.data.endDate,
    p_branch_id: parsed.data.branchId ?? null,
  });

  if (error) {
    console.error("[inventory:value-period] RPC failed", error.code);
    return {
      success: false,
      error: messages.inventory.value.calculateFailed,
    };
  }

  const totals = (data ?? []).reduce(
    (sum, row) => ({
      openingValue: sum.openingValue + Number(row.opening_value ?? 0),
      closingValue: sum.closingValue + Number(row.closing_value ?? 0),
    }),
    { openingValue: 0, closingValue: 0 },
  );

  return { success: true, data: totals };
}

export async function fetchInventoryValueByBranch(): Promise<
  ActionResult<{ rows: BranchValueRow[] }>
> {
  const ctx = await getAuthContextWithPermission(
    SYSTEM_ROLES,
    PERMISSION_KEYS.INVENTORY_VALUATION_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { claims } = ctx;
  const monetaryAccess = await loadInventoryMonetaryAccess(claims.user_role);
  if (!monetaryAccess.systemValuation || !monetaryAccess.client) {
    return { success: false, error: "Không có quyền" };
  }
  const supabase = monetaryAccess.client;

  const branchesQuery = supabase
    .from("branches")
    .select("id, name, branch_kind")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("name");

  const { data: branchList, error: brError } = await branchesQuery;

  if (brError) {
    return {
      success: false,
      error: messages.inventory.value.branchesLoadFailed,
    };
  }

  const branchIds = (branchList ?? []).map((b) => b.id);
  if (branchIds.length === 0) {
    return { success: true, data: { rows: [] } };
  }
  const stockBearingLocations = await fetchStockBearingLocationIds({
    supabase,
    tenantId: claims.tenant_id,
  });

  if (!stockBearingLocations.ok) {
    return {
      success: false,
      error: messages.inventory.value.stockLoadFailed,
    };
  }

  const stockBearingLocationIds = stockBearingLocations.locationIds;

  const valuationActive = await isValuationActive(
    supabase,
    claims.tenant_id,
  );
  const { data: stockRows, error: stockError } =
    stockBearingLocationIds.length > 0
      ? valuationActive
        ? await supabase
            .from("inventory_valuation_accounts")
            .select("branch_id, location_id, quantity, book_value")
            .eq("tenant_id", claims.tenant_id)
            .in("branch_id", branchIds)
            .in("location_id", stockBearingLocationIds)
        : await supabase
            .from("stock_levels")
            .select(
              "branch_id, location_id, current_quantity, avg_unit_cost",
            )
            .eq("tenant_id", claims.tenant_id)
            .in("branch_id", branchIds)
            .in("location_id", stockBearingLocationIds)
      : { data: [], error: null };

  if (stockError) {
    return {
      success: false,
      error: messages.inventory.value.stockLoadFailed,
    };
  }

  const totals = new Map<number, number>();
  for (const b of branchIds) {
    totals.set(b, 0);
  }

  for (const row of stockRows ?? []) {
    const bid = row.branch_id;
    const line =
      "book_value" in row
        ? Number(row.book_value)
        : computeLineValue(
            Number(row.current_quantity),
            row.avg_unit_cost != null ? Number(row.avg_unit_cost) : null,
          );
    totals.set(bid, (totals.get(bid) ?? 0) + line);
  }

  const rows: BranchValueRow[] = (branchList ?? []).map((b) => ({
    branchId: b.id,
    branchName: getBranchSiteDisplayName(b),
    totalValue: totals.get(b.id) ?? 0,
  }));

  return { success: true, data: { rows } };
}
