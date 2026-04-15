"use server";

import { z } from "zod";
import { MODULE_ACL } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../../_lib/auth";

const POS_ROLES = MODULE_ACL.pos.allowedRoles;

const branchIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Branch ID không hợp lệ" });

/**
 * Fetch full menu for POS display: categories -> items -> variants + modifiers + sides.
 * Only returns active categories and active items.
 */
export async function fetchMenuForPos(
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

  // Fetch categories + items + variants + modifiers (no self-join for sides)
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
          sort_order,
          is_active
        ),
        menu_item_modifiers (
          id,
          name,
          price,
          sort_order,
          is_active
        ),
        menu_item_available_sides!menu_item_available_sides_main_item_id_fkey (
          id,
          is_default,
          side_item_id
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

  // Build item lookup for resolving side_item references
  const itemLookup = new Map<
    number,
    { id: number; name: string; base_price: number }
  >();
  for (const cat of categories ?? []) {
    for (const item of cat.menu_items ?? []) {
      itemLookup.set(item.id, {
        id: item.id,
        name: item.name,
        base_price: item.base_price,
      });
    }
  }

  // Filter nested variants/modifiers to active only, resolve side_item
  const menu = (categories ?? []).map((cat) => ({
    ...cat,
    menu_items: (cat.menu_items ?? []).map((item) => ({
      ...item,
      menu_item_variants: (item.menu_item_variants ?? [])
        .filter((v) => v.is_active !== false)
        .sort((a, b) => a.sort_order - b.sort_order),
      menu_item_modifiers: (item.menu_item_modifiers ?? [])
        .filter((m) => m.is_active !== false)
        .sort((a, b) => a.sort_order - b.sort_order),
      menu_item_available_sides: (item.menu_item_available_sides ?? [])
        .map((s) => {
          const sideItem = itemLookup.get(s.side_item_id);
          if (!sideItem) return null;
          return { id: s.id, is_default: s.is_default, side_item: sideItem };
        })
        .filter((s) => s !== null),
    })),
  }));

  return { success: true, data: menu };
}
