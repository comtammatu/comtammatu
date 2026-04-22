"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import type { StaffRole } from "@comtammatu/shared/auth";
import { getAuthContext } from "./_lib/auth";
import { withAction } from "@/_lib/with-action";
import { PG_ERR } from "./_lib/constants";

/**
 * Route-level fast gate for the production (central kitchen) surface. Fine-grained
 * authz is enforced at RLS via `has_permission(branch_id, 'inventory:production_create' |
 * 'inventory:production_confirm')` and `has_permission_any('menu:write')` — so this
 * list only controls "who can reach the surface at all".
 *
 * Mirrors `PROCUREMENT_ROLES` shape: include every role that may hold the underlying
 * permission grants (owner bypass + super/area/branch managers + bếp trưởng/production_manager).
 */
const PRODUCTION_ROLES: readonly StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
  "production_manager",
];

/**
 * Roles whose operational context is a single branch and therefore must be pinned
 * to a `central_kitchen` branch when acting on production surfaces. Tenant-wide
 * roles (owner, super_manager, area_manager) bypass this check because their
 * scope is broader than a single site.
 */
const CK_BRANCH_SCOPED_ROLES: readonly StaffRole[] = [
  "branch_manager",
  "production_manager",
];

function isCentralKitchenScopedRole(role: StaffRole): boolean {
  return (CK_BRANCH_SCOPED_ROLES as readonly string[]).includes(role);
}

const productionLineSchema = z.object({
  finishedGoodId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1, { error: "Đơn vị không được để trống" }),
});

const productionRecipeSchema = z.object({
  finishedGoodId: z.coerce.number().int().positive(),
  ingredientId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1, { error: "Đơn vị không được để trống" }),
  yieldFactor: z.coerce.number().positive().default(1),
  note: z.string().optional(),
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

const idSchema = z.coerce.number().int().positive();

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
};

async function requireCentralKitchenBranch(
  supabase: unknown,
  tenantId: number,
  branchId: number,
) {
  const client = supabase as {
    from: (table: "branches") => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: unknown,
        ) => {
          eq: (
            column: string,
            value: unknown,
          ) => {
            maybeSingle: () => PromiseLike<{
              data: { branch_kind: string | null } | null;
              error: { code?: string; message?: string } | null;
            }>;
          };
          maybeSingle: () => PromiseLike<{
            data: { branch_kind: string | null } | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
    };
  };

  const { data, error } = await client
    .from("branches")
    .select("branch_kind")
    .eq("tenant_id", tenantId)
    .eq("id", branchId)
    .maybeSingle();

  if (error?.code === "42703") {
    return {
      ok: false,
      error:
        "Cần áp dụng migration `branch_kind` trước khi dùng màn Bếp trung tâm.",
    };
  }

  if (error) {
    return {
      ok: false,
      error: "Không thể kiểm tra quyền truy cập bếp trung tâm.",
    };
  }

  if (data?.branch_kind !== "central_kitchen") {
    return {
      ok: false,
      error: "Chỉ bếp trung tâm mới được phép thao tác ở màn này.",
    };
  }

  return { ok: true };
}

export interface ProductionOrderItemRow {
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

export interface ProductionRecipeRow {
  id: number;
  finished_good_id: number;
  finished_good_name: string;
  ingredient_id: number;
  ingredient_name: string;
  quantity: number;
  unit: string;
  yield_factor: number;
  note: string | null;
}

type ProductionRecipeQueryRow = {
  id: number;
  finished_good_id: number;
  ingredient_id: number;
  quantity: number | string;
  unit: string;
  yield_factor: number | string | null;
  note: string | null;
  finished_good: { id: number; name: string } | null;
  ingredient: { id: number; name: string } | null;
};

type ProductionRecipeQueryClient = {
  from: (table: "production_recipes") => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: unknown,
      ) => {
        order: (
          column: string,
          options?: { ascending?: boolean },
        ) => {
          order: (
            column: string,
            options?: { ascending?: boolean },
          ) => PromiseLike<{
            data: ProductionRecipeQueryRow[] | null;
            error: { code?: string; message?: string } | null;
          }>;
        };
      };
    };
  };
};

export async function fetchProductionRecipes(): Promise<
  ActionResult<ProductionRecipeRow[]>
> {
  const ctx = await getAuthContext(PRODUCTION_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  if (isCentralKitchenScopedRole(claims.user_role)) {
    if (claims.branch_id == null) {
      return {
        success: false,
        error: "Tài khoản chưa được gán bếp trung tâm.",
      };
    }
    const access = await requireCentralKitchenBranch(
      supabase,
      claims.tenant_id,
      claims.branch_id,
    );
    if (!access.ok) {
      return { success: false, error: access.error };
    }
  }
  const recipeClient = supabase as unknown as ProductionRecipeQueryClient;
  const { data, error } = await recipeClient
    .from("production_recipes")
    .select(
      `
      id,
      finished_good_id,
      ingredient_id,
      quantity,
      unit,
      yield_factor,
      note,
      finished_good:ingredients!production_recipes_finished_good_id_fkey ( id, name ),
      ingredient:ingredients!production_recipes_ingredient_id_fkey ( id, name )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .order("finished_good_id", { ascending: true })
    .order("ingredient_id", { ascending: true });

  if (error) {
    return { success: false, error: "Không thể tải công thức sản xuất." };
  }

  return {
    success: true,
    data:
      (data ?? []).map((row) => {
        const finishedGood = row.finished_good as {
          id: number;
          name: string;
        } | null;
        const ingredient = row.ingredient as {
          id: number;
          name: string;
        } | null;
        return {
          id: row.id,
          finished_good_id: row.finished_good_id,
          finished_good_name: finishedGood?.name ?? "Thành phẩm",
          ingredient_id: row.ingredient_id,
          ingredient_name: ingredient?.name ?? "Nguyên liệu",
          quantity: Number(row.quantity),
          unit: row.unit,
          yield_factor: Number(row.yield_factor ?? 1),
          note: row.note ?? null,
        };
      }) ?? [],
  };
}

export async function fetchProductionOrders(): Promise<
  ActionResult<ProductionOrderRow[]>
> {
  const ctx = await getAuthContext(PRODUCTION_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  if (isCentralKitchenScopedRole(claims.user_role)) {
    if (claims.branch_id == null) {
      return {
        success: false,
        error: "Tài khoản chưa được gán bếp trung tâm.",
      };
    }
    const access = await requireCentralKitchenBranch(
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

  // Branch-scoped roles (branch_manager, production_manager/bếp trưởng) see only
  // their own branch's orders. Tenant-wide roles keep full tenant visibility.
  if (
    isCentralKitchenScopedRole(claims.user_role) &&
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

  return { success: true, data: rows };
}

export const createProductionOrder = withAction(
  { roles: PRODUCTION_ROLES, schema: createProductionOrderSchema },
  async (data, { supabase }) => {
    const sb = supabase as unknown as RpcClient;
    const { error } = await sb.rpc("create_production_order", {
      p_branch_id: data.branchId,
      p_production_number: data.productionNumber,
      p_notes: data.notes ?? null,
      p_items: data.items.map((item) => ({
        finishedGoodId: item.finishedGoodId,
        quantity: item.quantity,
        unit: item.unit,
      })),
    });

    if (error) {
      if (error.code === PG_ERR.UNIQUE_VIOLATION) {
        return { success: false, error: "Số lệnh sản xuất đã tồn tại." };
      }
      if (error.code === PG_ERR.CHECK_VIOLATION || error.code === PG_ERR.INVALID_TEXT_REPRESENTATION) {
        return {
          success: false,
          error: "Bếp trung tâm hoặc thành phẩm chưa hợp lệ.",
        };
      }
      if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE) {
        return { success: false, error: "Không có quyền tạo lệnh sản xuất." };
      }
      return { success: false, error: "Không thể tạo lệnh sản xuất." };
    }

    return { success: true };
  },
);

export const upsertProductionRecipe = withAction(
  { roles: PRODUCTION_ROLES, schema: productionRecipeSchema },
  async (data, ctx) => {
    const { supabase, claims } = ctx;
    if (isCentralKitchenScopedRole(claims.user_role)) {
      if (claims.branch_id == null) {
        return {
          success: false,
          error: "Tài khoản chưa được gán bếp trung tâm.",
        };
      }
      const access = await requireCentralKitchenBranch(
        supabase,
        claims.tenant_id,
        claims.branch_id,
      );
      if (!access.ok) {
        return { success: false, error: access.error };
      }
    }
    const { data: ingredients, error: ingredientError } = await supabase
      .from("ingredients")
      .select("id, item_kind")
      .eq("tenant_id", claims.tenant_id)
      .in("id", [data.finishedGoodId, data.ingredientId]);

    if (ingredientError) {
      return { success: false, error: "Không thể kiểm tra nguyên liệu." };
    }

    const finishedGood = (ingredients ?? []).find(
      (item) => item.id === data.finishedGoodId,
    );
    const ingredient = (ingredients ?? []).find(
      (item) => item.id === data.ingredientId,
    );

    if (
      finishedGood?.item_kind !== "finished_good" ||
      ingredient?.item_kind !== "raw_material"
    ) {
      return {
        success: false,
        error: "Công thức phải nối thành phẩm với nguyên liệu.",
      };
    }

    const { error } = await supabase.from("production_recipes").upsert(
      {
        tenant_id: claims.tenant_id,
        finished_good_id: data.finishedGoodId,
        ingredient_id: data.ingredientId,
        quantity: data.quantity,
        unit: data.unit,
        yield_factor: data.yieldFactor,
        note: data.note ?? null,
      },
      { onConflict: "finished_good_id,ingredient_id,tenant_id" },
    );

    if (error) {
      return { success: false, error: "Không thể lưu công thức." };
    }

    return { success: true };
  },
);

export async function deleteProductionRecipe(
  recipeId: number,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(recipeId);
  if (!parsed.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContext(PRODUCTION_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  if (isCentralKitchenScopedRole(claims.user_role)) {
    if (claims.branch_id == null) {
      return {
        success: false,
        error: "Tài khoản chưa được gán bếp trung tâm.",
      };
    }
    const access = await requireCentralKitchenBranch(
      supabase,
      claims.tenant_id,
      claims.branch_id,
    );
    if (!access.ok) {
      return { success: false, error: access.error };
    }
  }
  const { error } = await supabase
    .from("production_recipes")
    .delete()
    .eq("id", parsed.data)
    .eq("tenant_id", claims.tenant_id);

  if (error) {
    return { success: false, error: "Không thể xóa công thức." };
  }

  return { success: true };
}

export async function deleteProductionRecipeGroup(
  finishedGoodId: number,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(finishedGoodId);
  if (!parsed.success)
    return { success: false, error: "ID thành phẩm không hợp lệ" };

  const ctx = await getAuthContext(PRODUCTION_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  if (isCentralKitchenScopedRole(claims.user_role)) {
    if (claims.branch_id == null) {
      return {
        success: false,
        error: "Tài khoản chưa được gán bếp trung tâm.",
      };
    }
    const access = await requireCentralKitchenBranch(
      supabase,
      claims.tenant_id,
      claims.branch_id,
    );
    if (!access.ok) {
      return { success: false, error: access.error };
    }
  }

  const { error } = await supabase
    .from("production_recipes")
    .delete()
    .eq("tenant_id", claims.tenant_id)
    .eq("finished_good_id", parsed.data);

  if (error) {
    return { success: false, error: "Không thể xóa công thức cũ." };
  }

  return { success: true };
}

export async function confirmProductionOrder(
  orderId: number,
): Promise<ActionResult> {
  const parsed = idSchema.safeParse(orderId);
  if (!parsed.success) return { success: false, error: "ID không hợp lệ" };

  const ctx = await getAuthContext(PRODUCTION_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;
  const sb = supabase as unknown as RpcClient;
  const { error } = await sb.rpc("confirm_production_order", {
    p_order_id: parsed.data,
  });

  if (error) {
    if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE) {
      return {
        success: false,
        error: "Không có quyền xác nhận lệnh sản xuất.",
      };
    }
    if (
      error.code === PG_ERR.CHECK_VIOLATION ||
      error.code === PG_ERR.INVALID_TEXT_REPRESENTATION ||
      error.code === "P0001"
    ) {
      if (error.message?.includes("production_recipe_missing")) {
        return {
          success: false,
          error: "Thiếu công thức sản xuất cho thành phẩm này.",
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

  const ctx = await getAuthContext(PRODUCTION_ROLES);
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
