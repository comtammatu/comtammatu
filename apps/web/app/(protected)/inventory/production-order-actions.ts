"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import {
  getAuthContextWithAnyPermission,
  getAuthContextWithPermission,
} from "./_lib/auth";
import { withAction } from "@/_lib/with-action";
import { PG_ERR } from "./_lib/constants";
import { PRODUCTION_ERROR_CODES } from "./production-types";
import type { ProductionShortageRow } from "./production-types";
import {
  idSchema,
  isProductionSiteScopedRole,
  PRODUCTION_ROLES,
  requireProductionBranch,
  type RpcClient,
} from "./_lib/production-shared";

const PRODUCTION_ORDER_PERMISSIONS = [
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CREATE,
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CONFIRM,
] as const;

const productionLineSchema = z.object({
  finishedGoodId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1, { error: "Đơn vị không được để trống" }),
  entryUnitId: z.coerce.number().int().positive().nullable().optional(),
});

const createProductionOrderSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  productionNumber: z.string().min(1, {
    error: "Số lệnh sản xuất không được để trống",
  }),
  notes: z.string().optional(),
  items: z.array(productionLineSchema).min(1, {
    error: "Cần ít nhất một thành phẩm",
  }),
});

const productionShortageListSchema = z.array(
  z.object({
    ingredient_id: z.coerce.number().int().positive(),
    ingredient_name: z.string(),
    unit: z.string(),
    needed: z.coerce.number(),
    on_hand: z.coerce.number(),
    missing: z.coerce.number(),
  }),
);

function parseShortagesDetail(
  details: string | null | undefined,
): ProductionShortageRow[] {
  if (!details) return [];
  try {
    const parsed = JSON.parse(details);
    const result = productionShortageListSchema.safeParse(parsed);
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}

interface ProductionOrderItemRow {
  id: number;
  finished_good_id: number;
  finished_good_name: string;
  quantity: number;
  unit: string;
  unit_cost_at_production: number | null;
}

export interface ProductionOrderRow {
  id: number;
  branch_id: number;
  branch_name: string;
  production_number: string;
  status: string;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  items: ProductionOrderItemRow[];
  total_cost: number;
}

export async function fetchProductionOrders(): Promise<
  ActionResult<ProductionOrderRow[]>
> {
  const ctx = await getAuthContextWithAnyPermission(
    PRODUCTION_ROLES,
    PRODUCTION_ORDER_PERMISSIONS,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  if (isProductionSiteScopedRole(claims.user_role)) {
    if (claims.branch_id == null) {
      return {
        success: false,
        error: "Tài khoản chưa được gán chi nhánh sản xuất.",
      };
    }
    const access = await requireProductionBranch(
      supabase,
      claims.tenant_id,
      claims.branch_id,
    );
    if (!access.ok) {
      return { success: false, error: access.error };
    }
  }

  let ordersQuery = supabase
    .from("production_orders")
    .select(
      `
      id,
      branch_id,
      production_number,
      status,
      notes,
      completed_at,
      created_at,
      branches ( id, name ),
      production_order_items (
        id,
        finished_good_id,
        quantity,
        unit,
        unit_cost_at_production,
        ingredients ( id, name, unit )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .order("created_at", { ascending: false });

  // Branch-scoped production managers see only their own branch's orders.
  // Tenant-wide roles keep full tenant visibility.
  if (
    isProductionSiteScopedRole(claims.user_role) &&
    claims.branch_id != null
  ) {
    ordersQuery = ordersQuery.eq("branch_id", claims.branch_id);
  }

  const { data, error } = await ordersQuery;

  if (error) {
    return { success: false, error: "Không thể tải lệnh sản xuất." };
  }

  const rows: ProductionOrderRow[] = (data ?? []).map((row) => {
    const items = (row.production_order_items ?? []).map((item) => {
      const ingredient = item.ingredients as {
        id: number;
        name: string;
        unit: string;
      } | null;
      const unitCost =
        item.unit_cost_at_production == null
          ? null
          : Number(item.unit_cost_at_production);
      return {
        id: item.id,
        finished_good_id: item.finished_good_id,
        finished_good_name: ingredient?.name ?? "Thành phẩm",
        quantity: Number(item.quantity),
        unit: item.unit ?? ingredient?.unit ?? "",
        unit_cost_at_production: unitCost,
      };
    });

    return {
      id: row.id,
      branch_id: row.branch_id,
      branch_name:
        (row.branches as { id: number; name: string } | null)?.name ?? "—",
      production_number: row.production_number,
      status: row.status,
      notes: row.notes ?? null,
      completed_at: row.completed_at ?? null,
      created_at: row.created_at,
      items,
      total_cost: items.reduce(
        (sum, item) =>
          sum + item.quantity * (item.unit_cost_at_production ?? 0),
        0,
      ),
    };
  });

  // Draft orders haven't been through the RPC, so unit_cost_at_production is
  // still null. Estimate as BOM × WAC at the branch (mirrors the
  // confirm_production_order RPC) so the UI can show an estimated total
  // cost before confirmation.
  const draftFgIds = new Set<number>();
  for (const order of rows) {
    if (order.status === "draft") {
      for (const item of order.items) draftFgIds.add(item.finished_good_id);
    }
  }

  if (draftFgIds.size > 0) {
    const fgIds = Array.from(draftFgIds);
    const [bomRes, wacRes] = await Promise.all([
      supabase
        .from("production_recipes")
        .select(
          "finished_good_id, ingredient_id, quantity, yield_factor, ingredients:ingredients!production_recipes_ingredient_id_fkey ( purchase_to_measure_factor, unit_cost )",
        )
        .in("finished_good_id", fgIds)
        .eq("tenant_id", claims.tenant_id),
      supabase
        .from("stock_levels")
        .select("ingredient_id, avg_unit_cost, branches!inner ( branch_kind )")
        .eq("tenant_id", claims.tenant_id)
        .eq("branches.branch_kind", "branch")
        .not("avg_unit_cost", "is", null),
    ]);

    const wacMap = new Map<number, number>();
    if (wacRes.data) {
      const acc = new Map<number, { sum: number; count: number }>();
      for (const w of wacRes.data as Array<{
        ingredient_id: number;
        avg_unit_cost: number | string | null;
      }>) {
        const id = Number(w.ingredient_id);
        const cost = Number(w.avg_unit_cost ?? 0);
        const e = acc.get(id) ?? { sum: 0, count: 0 };
        e.sum += cost;
        e.count += 1;
        acc.set(id, e);
      }
      for (const [id, e] of acc) wacMap.set(id, e.sum / e.count);
    }

    type BomRow = {
      finished_good_id: number;
      ingredient_id: number;
      quantity: number | string | null;
      yield_factor: number | string | null;
      ingredients: {
        purchase_to_measure_factor: number | string | null;
        unit_cost: number | string | null;
      } | null;
    };
    const costPerFg = new Map<number, number>();
    for (const bom of (bomRes.data ?? []) as BomRow[]) {
      const fgId = Number(bom.finished_good_id);
      const rawId = Number(bom.ingredient_id);
      const qty = Number(bom.quantity ?? 0);
      const yf = Number(bom.yield_factor ?? 1) || 1;
      const conv =
        Number(bom.ingredients?.purchase_to_measure_factor ?? 1) || 1;
      const wac = wacMap.get(rawId);
      const refCost =
        bom.ingredients?.unit_cost != null
          ? Number(bom.ingredients.unit_cost)
          : 0;
      const rawUnitCost = wac != null ? wac : refCost;
      const rawNeedPurchase = qty / yf / conv;
      costPerFg.set(
        fgId,
        (costPerFg.get(fgId) ?? 0) + rawNeedPurchase * rawUnitCost,
      );
    }

    for (const order of rows) {
      if (order.status !== "draft") continue;
      let total = 0;
      for (const item of order.items) {
        if (item.unit_cost_at_production == null) {
          item.unit_cost_at_production =
            costPerFg.get(item.finished_good_id) ?? 0;
        }
        total += item.quantity * (item.unit_cost_at_production ?? 0);
      }
      order.total_cost = total;
    }
  }

  return { success: true, data: rows };
}

export const createProductionOrder = withAction(
  {
    roles: PRODUCTION_ROLES,
    schema: createProductionOrderSchema,
    permission: PERMISSION_KEYS.INVENTORY_PRODUCTION_CREATE,
    permissionBranchId: (data) => data.branchId,
  },
  async (data, { supabase, claims }) => {
    const sb = supabase as unknown as RpcClient;
    const { data: rpcData, error } = await sb.rpc("create_production_order", {
      p_branch_id: data.branchId,
      p_production_number: data.productionNumber,
      p_notes: data.notes ?? null,
      p_items: data.items.map((item) => ({
        finishedGoodId: item.finishedGoodId,
        quantity: item.quantity,
        unit: item.unit,
        entryUnitId: item.entryUnitId ?? null,
      })),
    });

    if (error) {
      if (error.code === PG_ERR.UNIQUE_VIOLATION) {
        return { success: false, error: "Số lệnh sản xuất đã tồn tại." };
      }
      if (
        error.code === PG_ERR.CHECK_VIOLATION ||
        error.code === PG_ERR.INVALID_TEXT_REPRESENTATION
      ) {
        return {
          success: false,
          error: "Chi nhánh sản xuất hoặc thành phẩm chưa hợp lệ.",
        };
      }
      if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE) {
        return { success: false, error: "Không có quyền tạo lệnh sản xuất." };
      }
      return { success: false, error: "Không thể tạo lệnh sản xuất." };
    }

    // create_production_order persists finished_good/quantity/unit only. Persist
    // the entry-unit per output line so confirm_production_order can convert the
    // finished-good output to base via inv_to_base(). NULL entry units are
    // already base (back-compat) and skipped.
    const orderId = (rpcData as { id?: number } | null)?.id;
    if (orderId != null) {
      const entryUnitByFinishedGood = new Map<number, number>();
      for (const item of data.items) {
        if (item.entryUnitId != null) {
          entryUnitByFinishedGood.set(item.finishedGoodId, item.entryUnitId);
        }
      }
      for (const [finishedGoodId, entryUnitId] of entryUnitByFinishedGood) {
        const { error: unitError } = await supabase
          .from("production_order_items")
          .update({ entry_unit_id: entryUnitId })
          .eq("tenant_id", claims.tenant_id)
          .eq("production_order_id", orderId)
          .eq("finished_good_id", finishedGoodId);
        if (unitError) {
          return {
            success: false,
            error: "Không thể lưu đơn vị thành phẩm của dòng lệnh.",
          };
        }
      }
    }

    return { success: true };
  },
);


export async function confirmProductionOrder(
  orderId: number,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(orderId);
  if (!parsed.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContextWithPermission(
    PRODUCTION_ROLES,
    PERMISSION_KEYS.INVENTORY_PRODUCTION_CONFIRM,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;
  const sb = supabase as unknown as RpcClient;
  const { error } = await sb.rpc("confirm_production_order", {
    p_order_id: parsed.data,
  });

  if (error) {
    const message = error.message ?? "";

    if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE) {
      if (message.includes("branch_scope_violation")) {
        return {
          success: false,
          error:
            "Tài khoản chưa được cấp quyền xác nhận sản xuất tại chi nhánh này.",
        };
      }
      return {
        success: false,
        error: "Không có quyền xác nhận lệnh sản xuất.",
      };
    }

    if (error.code === "P0002") {
      if (message.includes("production_location_missing")) {
        return {
          success: false,
          error:
            "Chi nhánh chưa có kho nhận mặc định. Tạo Inventory Location với 'Mặc định nhận hàng'.",
        };
      }
      if (message.includes("production_order_not_found")) {
        return { success: false, error: "Không tìm thấy lệnh sản xuất." };
      }
      return { success: false, error: "Không thể xác nhận lệnh sản xuất." };
    }

    if (
      error.code === PG_ERR.CHECK_VIOLATION ||
      error.code === PG_ERR.INVALID_TEXT_REPRESENTATION ||
      error.code === "P0001"
    ) {
      if (message.includes("production_recipe_missing")) {
        return {
          success: false,
          error: "Thiếu công thức sản xuất cho thành phẩm này.",
        };
      }
      if (message.includes("insufficient_stock_for_production")) {
        const shortages = parseShortagesDetail(error.details);
        const summary =
          shortages.length > 0
            ? `Thiếu ${shortages.length} nguyên liệu trong chi nhánh.`
            : "Không đủ tồn kho nguyên liệu trong chi nhánh để sản xuất lệnh này.";
        return {
          success: false,
          error: summary,
          errorCode: PRODUCTION_ERROR_CODES.INSUFFICIENT_STOCK,
          meta: { shortages },
        };
      }
      if (message.includes("production_conversion_factor_invalid")) {
        return {
          success: false,
          error:
            "Nguyên liệu thiếu hệ số quy đổi đơn vị mua → đo. Cập nhật trong danh mục nguyên liệu.",
        };
      }
      if (message.includes("production_order_not_draft")) {
        return {
          success: false,
          error: "Lệnh đã được xác nhận hoặc hủy trước đó.",
        };
      }
      if (message.includes("production_order_empty")) {
        return { success: false, error: "Lệnh sản xuất chưa có thành phẩm." };
      }
      if (message.includes("production_cost_invalid")) {
        return {
          success: false,
          error: "Chi phí sản xuất tính ra giá trị âm.",
        };
      }
      if (message.includes("branch_must_be_operational")) {
        return {
          success: false,
          error: "Chi nhánh sản xuất không hợp lệ.",
        };
      }
      if (message.includes("production_item_must_be_finished_good")) {
        return {
          success: false,
          error: "Có dòng không phải thành phẩm trong lệnh.",
        };
      }
      return {
        success: false,
        error: "Không thể xác nhận do dữ liệu sản xuất chưa hợp lệ.",
      };
    }
    return { success: false, error: "Không thể xác nhận lệnh sản xuất." };
  }

  return { success: true };
}

export async function cancelProductionOrder(
  orderId: number,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(orderId);
  if (!parsed.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContextWithPermission(
    PRODUCTION_ROLES,
    PERMISSION_KEYS.INVENTORY_PRODUCTION_CONFIRM,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;
  const sb = supabase as unknown as RpcClient;
  const { error } = await sb.rpc("cancel_production_order", {
    p_order_id: parsed.data,
  });

  if (error) {
    if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE) {
      return { success: false, error: "Không có quyền hủy lệnh sản xuất." };
    }
    return { success: false, error: "Không thể hủy lệnh sản xuất." };
  }

  return { success: true };
}
