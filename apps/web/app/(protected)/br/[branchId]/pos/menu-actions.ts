"use server";

import { z } from "zod";
import { unstable_cache, revalidateTag } from "next/cache";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { messages } from "@lib/messages";
import { getAuthContextWithPermission } from "../../_lib/auth";
import { isPosBranchInScope } from "./_lib/auth";
import type { MenuItemDailyLimit } from "./pos-menu-types";

const POS_ROLES = MODULE_ACL.pos.allowedRoles;

const branchIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Branch ID không hợp lệ" });

// Matches the slim RPC RETURNS TABLE (PR-3) minus fields the client never
// reads — see MenuItemDailyLimit.
interface DailyLimitRow {
  menu_item_id: number;
  is_disabled: boolean;
  sold_today: number;
  manual_limit_quantity: number | null;
  available_to_sell: number | null;
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
export async function fetchMenuForPos(
  branchId: number,
  forceRefresh?: boolean,
): Promise<ActionResult> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  if (forceRefresh) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    revalidateTag("menu-structure");
  }

  const ctx = await getAuthContextWithPermission(
    POS_ROLES,
    PERMISSION_KEYS.POS_USE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (!isPosBranchInScope(claims, parsedBranchId.data)) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // Parallel: cached menu structure + uncached daily-limits. Structure cache
  // hit short-circuits the heavy join (~400ms) on every post-Server-Action
  // route revalidation; daily-limits stay fresh.
  let categories: Awaited<ReturnType<typeof getCachedMenuStructure>>;
  let limitRows: unknown;
  try {
    // `p_exclude_hold_tokens` is not yet in generated types — call via the
    // cast escape hatch.
    const rpcCaller = supabase as unknown as {
      rpc: (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>;
    };
    // RSC initial load has no live hold token yet — omit p_exclude_hold_tokens.
    const limitsPromise = rpcCaller.rpc(
      "get_branch_menu_daily_limits_for_pos",
      { p_branch_id: parsedBranchId.data },
    );
    const [structure, limitsRes] = await Promise.all([
      getCachedMenuStructure(claims.tenant_id),
      limitsPromise,
    ]);
    categories = structure;
    limitRows = limitsRes.data;
  } catch {
    return { success: false, error: messages.pos.menu.loadFailed };
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
        is_disabled: row.is_disabled,
        sold_today: row.sold_today,
        manual_limit_quantity: row.manual_limit_quantity,
        available_to_sell: row.available_to_sell,
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
          const sideLimit = limitsByItemId.get(s.side_item_id);
          if (sideLimit?.is_disabled) return null;
          const sideAvailable = sideLimit?.available_to_sell ?? null;
          if (
            typeof sideAvailable === "number" &&
            Number.isFinite(sideAvailable) &&
            sideAvailable <= 0
          ) {
            return null;
          }
          return { id: s.id, is_default: s.is_default, side_item: sideItem };
        })
        .filter((s) => s !== null),
      daily_limit: limitsByItemId.get(item.id) ?? null,
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
 * `excludeHoldTokens` forwards the calling terminal's own live daily-limit
 * hold token(s) so the server drops its own reservation from
 * `active_hold_demand` — the terminal's own demand is still accounted for
 * client-side via the draft-demand subtraction in `daily-limit-draft.ts`
 * (exactly one side credits own holds; D064 §4).
 */
export async function fetchDailyLimitsForPos(
  branchId: number,
  excludeHoldTokens?: string[],
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
  if (!isPosBranchInScope(claims, parsedBranchId.data)) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // `p_exclude_hold_tokens` is not yet in generated types — call via the
  // cast escape hatch.
  const rpcCaller = supabase as unknown as {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>;
  };

  const limitsRes = await rpcCaller.rpc("get_branch_menu_daily_limits_for_pos", {
    p_branch_id: parsedBranchId.data,
    p_exclude_hold_tokens:
      excludeHoldTokens && excludeHoldTokens.length > 0
        ? excludeHoldTokens
        : null,
  });

  if (limitsRes.error) {
    return { success: false, error: messages.pos.menu.loadMenuLimitsFailed };
  }

  return {
    success: true,
    data: Array.isArray(limitsRes.data) ? limitsRes.data : [],
  };
}
