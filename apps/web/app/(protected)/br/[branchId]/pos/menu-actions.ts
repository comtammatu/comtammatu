"use server";

import { z } from "zod";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@comtammatu/database";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "../../_lib/auth";
import type { MenuItemDailyLimit } from "./pos-menu-types";

const POS_ROLES = MODULE_ACL.pos.allowedRoles;

const branchIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Branch ID không hợp lệ" });

type DailyLimitRow = MenuItemDailyLimit & {
  menu_item_id: number;
};

function dailyLimitRemaining(limit: MenuItemDailyLimit): number | null {
  if (
    typeof limit.available_to_sell === "number" &&
    Number.isFinite(limit.available_to_sell)
  ) {
    return Math.max(0, limit.available_to_sell);
  }
  const stockCap = limit.stock_capacity ?? null;
  const cap =
    limit.limit_quantity == null
      ? stockCap
      : stockCap == null
        ? limit.limit_quantity
        : Math.min(limit.limit_quantity, stockCap);
  return cap == null ? null : Math.max(0, cap - limit.sold_today);
}

/**
 * Cached menu structure (categories + items + variants + modifiers + sides).
 * Tenant-scoped, low-volatility — admin menu CRUD invalidates via
 * `revalidateTag('menu-structure')`. 5-minute TTL is a safety net for any
 * mutation path that forgets to call revalidateTag.
 *
 * Service-role client bypasses RLS but the explicit `tenant_id` filter
 * preserves tenant isolation. Outer fetchMenuForPos validates the caller's
 * branch membership BEFORE calling this — never invoke directly.
 *
 * Cache key auto-derived from `tenantId` arg (Next.js JSON-serializes args).
 * Per-branch daily-limits stay UNCACHED — they change with every paid order.
 */
const getCachedMenuStructure = unstable_cache(
  async (tenantId: number) => {
    const sb = createServiceClient();
    const { data, error } = await sb
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
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .eq("menu_items.is_active", true)
      .order("sort_order", { ascending: true })
      .order("sort_order", {
        ascending: true,
        referencedTable: "menu_items",
      });

    if (error) {
      throw new Error(`fetchMenuStructure: ${error.message}`);
    }
    return data ?? [];
  },
  ["menu-structure"],
  {
    revalidate: 300,
    tags: ["menu-structure"],
  },
);

/**
 * Fetch full menu for POS display: categories -> items -> variants + modifiers + sides.
 * Only returns active categories and active items.
 */
export async function fetchMenuForPos(branchId: number): Promise<ActionResult> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  // Verify branch_id matches JWT claim
  if (claims.branch_id !== parsedBranchId.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // Parallel: cached menu structure + uncached daily-limits + ingredient caps.
  // Structure cache hit short-circuits the heavy join (~400ms) on every
  // post-Server-Action route revalidation; daily-limits + caps stay fresh.
  // The caps RPC returns empty unless the branch flag is on, so the merge is
  // a no-op for non-enforcing branches.
  let categories: Awaited<ReturnType<typeof getCachedMenuStructure>>;
  let limitRows: unknown;
  let capRows: unknown;
  try {
    // `get_branch_menu_ingredient_caps_for_pos` is new and not yet in the
    // generated types — call it via the same cast escape hatch as the
    // daily-limit RPC below.
    const rpcCaller = supabase as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>;
    };
    const limitsPromise = rpcCaller.rpc(
      "get_branch_menu_daily_limits_for_pos",
      { p_branch_id: parsedBranchId.data },
    );
    const capsPromise = rpcCaller.rpc(
      "get_branch_menu_ingredient_caps_for_pos",
      { p_branch_id: parsedBranchId.data },
    );
    const [structure, limitsRes, capsRes] = await Promise.all([
      getCachedMenuStructure(claims.tenant_id),
      limitsPromise,
      capsPromise,
    ]);
    categories = structure;
    limitRows = limitsRes.data;
    capRows = capsRes.data;
  } catch {
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
  const limitsByItemId = new Map<number, MenuItemDailyLimit>();
  if (Array.isArray(limitRows)) {
    // Availability fields are absent from generated types until the migration
    // is applied to the type-source schema.
    for (const row of limitRows as DailyLimitRow[]) {
      limitsByItemId.set(row.menu_item_id, {
        limit_quantity: row.limit_quantity,
        is_disabled: row.is_disabled,
        sold_today: row.sold_today,
        stock_capacity: row.stock_capacity,
        stock_capacity_live: row.stock_capacity_live,
        manual_limit_quantity: row.manual_limit_quantity,
        accepted_today: row.accepted_today,
        pending_unfinalized_demand: row.pending_unfinalized_demand,
        active_hold_demand: row.active_hold_demand,
        available_to_sell: row.available_to_sell,
      });
    }
  }
  // Empty when the branch flag `pos_ingredient_stock_block` is off → every
  // item gets `ingredient_cap: null` (no cap). `max_sellable` is a snapshot
  // upper bound, not a per-dish guarantee — the order_items trigger is the
  // hard gate.
  const capsByItemId = new Map<number, number>();
  if (Array.isArray(capRows)) {
    for (const row of capRows as Array<{
      menu_item_id: number;
      max_sellable: number;
    }>) {
      capsByItemId.set(row.menu_item_id, row.max_sellable);
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
          const sideLimit = limitsByItemId.get(s.side_item_id);
          if (sideLimit?.is_disabled) return null;
          const sideRemaining =
            sideLimit == null ? null : dailyLimitRemaining(sideLimit);
          if (sideRemaining !== null && sideRemaining <= 0) {
            return null;
          }
          return { id: s.id, is_default: s.is_default, side_item: sideItem };
        })
        .filter((s) => s !== null),
      daily_limit: limitsByItemId.get(item.id) ?? null,
      ingredient_cap: capsByItemId.get(item.id) ?? null,
    })),
  }));

  return { success: true, data: menu };
}

/**
 * Lean limits-only fetch for realtime catchup. Used by `useDailyLimitSync`
 * on SUBSCRIBED reconnect to fill events missed during disconnect — keeps
 * categories/variants/sides static (set at SSR by `fetchMenuForPos`) and
 * refreshes only the volatile `sold_today` + `is_disabled` slice.
 *
 * Also returns the ingredient caps under `meta.ingredientCaps` so the same
 * post-submit revalidation that refreshes daily-limits picks up the new
 * `max_sellable` snapshot (caps couple via shared ingredients — a sale of
 * dish A can lower dish B's cap). No stock realtime channel: caps ride the
 * existing daily-limit refetch cadence only.
 */
export async function fetchDailyLimitsForPos(
  branchId: number,
): Promise<ActionResult> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;
  if (claims.branch_id !== parsedBranchId.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // `get_branch_menu_ingredient_caps_for_pos` is not yet in generated types —
  // call it via the same cast escape hatch as the daily-limit RPC.
  const capsPromise = (
    supabase as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>;
    }
  ).rpc("get_branch_menu_ingredient_caps_for_pos", {
    p_branch_id: parsedBranchId.data,
  });

  const [limitsRes, capsRes] = await Promise.all([
    supabase.rpc("get_branch_menu_daily_limits_for_pos", {
      p_branch_id: parsedBranchId.data,
    }),
    capsPromise,
  ]);

  if (limitsRes.error) {
    return { success: false, error: "Không thể tải giới hạn bán hàng." };
  }

  return {
    success: true,
    data: Array.isArray(limitsRes.data) ? limitsRes.data : [],
    meta: {
      ingredientCaps: Array.isArray(capsRes.data) ? capsRes.data : [],
    },
  };
}
