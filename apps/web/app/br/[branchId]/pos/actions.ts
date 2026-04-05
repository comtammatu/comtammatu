"use server";

import { z } from "zod";
import { MODULE_ACL } from "@comtammatu/shared/auth";
import { getAuthContext } from "../../_lib/auth";

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
