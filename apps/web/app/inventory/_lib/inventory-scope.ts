import { cache } from "react";
import { cookies } from "next/headers";
import type { JwtClaims } from "@comtammatu/shared/auth";
import type { TenantSupabase } from "./types";

export const INVENTORY_BRANCH_COOKIE = "inv_branch_id";
export const INVENTORY_BRANCH_COOKIE_PATH = "/inventory";
export const INVENTORY_BRANCH_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type InventoryBranchOption = {
  id: number;
  name: string;
  branch_kind: string;
};

export type InventoryBranchScope = {
  allowedBranches: InventoryBranchOption[];
  canSelectAll: boolean;
  selectedBranchId: number | null;
  defaultBranchId: number | null;
};

const TENANT_WIDE_ROLES = new Set(["owner", "super_manager", "office"]);

const fetchAllActiveBranches = cache(
  async (
    supabase: TenantSupabase,
    tenantId: number,
  ): Promise<InventoryBranchOption[]> => {
    const { data, error } = await supabase
      .from("branches")
      .select("id, name, branch_kind")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("branch_kind")
      .order("id");
    if (error) return [];
    return data ?? [];
  },
);

const fetchAreaBranches = cache(
  async (
    supabase: TenantSupabase,
    tenantId: number,
    areaId: number,
  ): Promise<InventoryBranchOption[]> => {
    const { data, error } = await supabase
      .from("area_branches")
      .select("branches(id, name, branch_kind)")
      .eq("tenant_id", tenantId)
      .eq("area_id", areaId);
    if (error || !data) return [];
    const rows = data
      .map((row) => row.branches as InventoryBranchOption | null)
      .filter((b): b is InventoryBranchOption => b !== null);
    return rows.sort((a, b) => {
      if (a.branch_kind !== b.branch_kind) {
        return a.branch_kind.localeCompare(b.branch_kind);
      }
      return a.id - b.id;
    });
  },
);

function pickDefault(
  branches: InventoryBranchOption[],
  preferred: number | null,
): number | null {
  if (preferred != null && branches.some((b) => b.id === preferred)) {
    return preferred;
  }
  const centralWarehouse = branches.find(
    (b) => b.branch_kind === "central_warehouse",
  );
  if (centralWarehouse) return centralWarehouse.id;
  return branches[0]?.id ?? null;
}

/**
 * Resolve which branches an inventory user can see + which one is currently
 * selected. URL `?branchId=` wins if allowed; otherwise fall back to the
 * user's home branch, else first central_warehouse, else first allowed.
 *
 * - owner / super_manager / office → every active tenant branch
 * - area_manager                  → branches mapped in `area_branches`
 * - other roles                    → locked to `claims.branch_id`
 */
export const resolveInventoryBranchScope = cache(
  async (
    supabase: TenantSupabase,
    claims: JwtClaims,
    requestedBranchId: number | null,
  ): Promise<InventoryBranchScope> => {
    let allowedBranches: InventoryBranchOption[] = [];
    let canSelectAll = false;

    if (TENANT_WIDE_ROLES.has(claims.user_role)) {
      allowedBranches = await fetchAllActiveBranches(
        supabase,
        claims.tenant_id,
      );
      canSelectAll = true;
    } else if (claims.user_role === "area_manager") {
      if (claims.area_id != null) {
        allowedBranches = await fetchAreaBranches(
          supabase,
          claims.tenant_id,
          claims.area_id,
        );
      }
      canSelectAll = true;
    } else if (claims.branch_id != null) {
      const allBranches = await fetchAllActiveBranches(
        supabase,
        claims.tenant_id,
      );
      const own = allBranches.find((b) => b.id === claims.branch_id);
      if (own) allowedBranches = [own];
      canSelectAll = false;
    }

    const defaultBranchId = pickDefault(allowedBranches, claims.branch_id);

    let selectedBranchId = defaultBranchId;
    if (
      requestedBranchId != null &&
      allowedBranches.some((b) => b.id === requestedBranchId)
    ) {
      selectedBranchId = requestedBranchId;
    }

    return {
      allowedBranches,
      canSelectAll,
      selectedBranchId,
      defaultBranchId,
    };
  },
);

/**
 * Parse a raw `branchId` query-param value. Returns null for missing or
 * malformed values (non-numeric, ≤0). Callers pass result into
 * `resolveInventoryBranchScope` which does the authorization check.
 */
export function parseBranchIdParam(raw: string | string[] | undefined): number | null {
  if (raw == null) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Read the persisted branch-id cookie set by `<InventoryBranchFilter>`.
 * Used as a fallback default when the URL has no `?branchId=`.
 * The cookie is path-scoped to `/inventory` so it never leaks elsewhere.
 */
export async function readBranchIdCookie(): Promise<number | null> {
  const store = await cookies();
  const raw = store.get(INVENTORY_BRANCH_COOKIE)?.value;
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

/**
 * Resolve the requested branch id with the precedence:
 *   URL ?branchId= > inv_branch_id cookie > null
 * Server pages should use this instead of `parseBranchIdParam` so that
 * sidebar nav clicks (which drop query params) keep the user's last
 * selected branch instead of snapping back to the system default.
 */
export async function resolveRequestedBranchId(
  raw: string | string[] | undefined,
): Promise<number | null> {
  const fromUrl = parseBranchIdParam(raw);
  if (fromUrl != null) return fromUrl;
  return readBranchIdCookie();
}
