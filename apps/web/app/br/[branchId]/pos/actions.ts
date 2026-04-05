"use server";

import { z } from "zod";
import { MODULE_ACL } from "@comtammatu/shared/auth";
import { getAuthContext } from "../../_lib/auth";
import { cartStateSchema, calcItemSubtotal } from "./types";
import type { CartState } from "./types";

/* ─── Types ─── */

interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/* ─── Constants ─── */

const POS_ROLES = MODULE_ACL.pos.allowedRoles;

/* ─── Input Schemas ─── */

const branchIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Branch ID không hợp lệ" });

/* ─── fetchMenuForPos ─── */

/**
 * Fetch full menu for POS display: categories → items → variants + modifiers + sides.
 * Only returns active categories and active items.
 */
export async function fetchMenuForPos(branchId: number): Promise<ActionResult> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContext(POS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Verify branch_id matches JWT claim
  if (claims.branch_id !== parsedBranchId.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // Fetch active categories with nested active items, variants, modifiers, sides
  const { data: categories, error: catError } = await supabase
    .from("menu_categories")
    .select(
      `
      id,
      name,
      type,
      sort_order,
      menu_items!inner (
        id,
        name,
        base_price,
        description,
        image_url,
        sort_order,
        menu_item_variants (
          id,
          name,
          price_adjustment,
          sort_order
        ),
        menu_item_modifiers (
          id,
          name,
          price,
          sort_order
        ),
        menu_item_available_sides (
          id,
          is_default,
          side_item:menu_items!menu_item_available_sides_side_item_id_fkey (
            id,
            name,
            base_price
          )
        )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .eq("menu_items.is_active", true)
    .order("sort_order", { ascending: true })
    .order("sort_order", {
      ascending: true,
      referencedTable: "menu_items",
    });

  if (catError) {
    return { success: false, error: "Không thể tải menu. Vui lòng thử lại." };
  }

  // Filter nested variants/modifiers to active only, sort them
  const menu = (categories ?? []).map((cat) => ({
    ...cat,
    menu_items: (cat.menu_items ?? []).map((item) => ({
      ...item,
      menu_item_variants: (item.menu_item_variants ?? [])
        .filter((v) => "is_active" in v && v.is_active !== false)
        .sort((a, b) => a.sort_order - b.sort_order),
      menu_item_modifiers: (item.menu_item_modifiers ?? [])
        .filter((m) => "is_active" in m && m.is_active !== false)
        .sort((a, b) => a.sort_order - b.sort_order),
      menu_item_available_sides: item.menu_item_available_sides ?? [],
    })),
  }));

  return { success: true, data: menu };
}

/* ─── fetchTablesForBranch ─── */

/**
 * Fetch active tables for a branch (excludes maintenance tables).
 * Used for table selection when order_type = dine_in.
 */
export async function fetchTablesForBranch(
  branchId: number,
): Promise<ActionResult> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContext(POS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Verify branch_id matches JWT claim
  if (claims.branch_id !== parsedBranchId.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const { data: tables, error } = await supabase
    .from("tables")
    .select(
      `
      id,
      number,
      capacity,
      status,
      zone_id,
      branch_zones (
        id,
        name
      )
    `,
    )
    .eq("branch_id", parsedBranchId.data)
    .eq("tenant_id", claims.tenant_id)
    .neq("status", "maintenance")
    .order("number", { ascending: true });

  if (error) {
    return {
      success: false,
      error: "Không thể tải danh sách bàn. Vui lòng thử lại.",
    };
  }

  return { success: true, data: tables ?? [] };
}

/* ─── submitOrder ─── */

/**
 * Submit a new order from the POS cart.
 * Calls the create_order RPC which atomically creates order + items + status history.
 */
export async function submitOrder(
  branchId: number,
  cart: CartState,
): Promise<ActionResult<{ order_id: number; order_number: string }>> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const parsedCart = cartStateSchema.safeParse(cart);
  if (!parsedCart.success) {
    return { success: false, error: "Dữ liệu giỏ hàng không hợp lệ" };
  }

  if (parsedCart.data.items.length === 0) {
    return { success: false, error: "Giỏ hàng trống" };
  }

  const ctx = await getAuthContext(POS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Verify branch_id matches JWT claim
  if (claims.branch_id !== parsedBranchId.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // Get user ID for created_by
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Phiên đăng nhập hết hạn" };

  // Transform cart items to RPC JSONB format
  const rpcItems = parsedCart.data.items.map((item) => ({
    menu_item_id: item.menu_item_id,
    variant_id: item.variant_id ?? null,
    item_name: item.item_name,
    variant_name: item.variant_name ?? null,
    quantity: item.quantity,
    unit_price: item.unit_price,
    modifiers: item.modifiers.map((m) => ({
      modifier_id: m.modifier_id,
      name: m.name,
      price: m.price,
    })),
    sides: item.sides.map((s) => ({
      side_item_id: s.side_item_id,
      name: s.name,
      is_default: s.is_default,
    })),
    subtotal: calcItemSubtotal(item),
    note: item.note ?? null,
  }));

  const { data, error } = await (supabase.rpc as CallableFunction)(
    "create_order",
    {
      p_tenant_id: claims.tenant_id,
      p_branch_id: parsedBranchId.data,
      p_created_by: user.id,
      p_items: JSON.stringify(rpcItems),
      p_order_type: parsedCart.data.order_type,
      p_table_id: parsedCart.data.table_id ?? null,
      p_note: parsedCart.data.note ?? null,
    },
  );

  if (error) {
    if (error.message?.includes("empty")) {
      return { success: false, error: "Giỏ hàng trống" };
    }
    return {
      success: false,
      error: "Không thể tạo đơn hàng. Vui lòng thử lại.",
    };
  }

  const result = data as unknown as {
    order_id: number;
    order_number: string;
  } | null;

  if (!result) {
    return {
      success: false,
      error: "Không thể tạo đơn hàng. Vui lòng thử lại.",
    };
  }

  return {
    success: true,
    data: { order_id: result.order_id, order_number: result.order_number },
  };
}
