import "server-only";

import type { createServiceClient } from "@comtammatu/database/supabase/service";

export const MENU_LIMIT_AVAILABILITY_CACHE_MS = 15_000;

type ServiceClient = ReturnType<typeof createServiceClient>;

type CacheEntry = {
  expiresAt: number;
  data: unknown;
};

const cache = new Map<string, CacheEntry>();

type MenuLimitAvailabilityResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
};

export async function loadCachedBranchMenuLimitAvailability(
  supabase: ServiceClient,
  args: {
    tenantId: number;
    branchId: number;
    limitDate: string;
    stockGateEnabled: boolean;
  },
): Promise<MenuLimitAvailabilityResult> {
  const key = `${args.tenantId}:${args.branchId}:${args.limitDate}:${args.stockGateEnabled ? "1" : "0"}`;
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expiresAt > now) {
    return { data: hit.data, error: null };
  }

  const result = await supabase.rpc("branch_menu_limit_availability", {
    p_tenant_id: args.tenantId,
    p_branch_id: args.branchId,
    p_limit_date: args.limitDate,
    p_stock_gate_enabled: args.stockGateEnabled,
  });
  if (result.error) {
    return {
      data: result.data,
      error: { message: result.error.message, code: result.error.code },
    };
  }
  cache.set(key, {
    expiresAt: now + MENU_LIMIT_AVAILABILITY_CACHE_MS,
    data: result.data,
  });
  return { data: result.data, error: null };
}
