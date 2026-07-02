import {
  centralSiteBranchKindForRole,
  type BranchHubContext,
  type JwtClaims,
} from "@comtammatu/shared/auth";

type HeaderReader = {
  get(name: string): string | null;
};

const MOBILE_USER_AGENT = /Android|iPhone|iPad|iPod|Mobile|Tablet/i;

export function resolveBranchHubContextFromHeaders(
  headers: HeaderReader,
): BranchHubContext {
  const mobileHint = headers.get("sec-ch-ua-mobile");
  const userAgent = headers.get("user-agent") ?? "";

  return {
    standaloneStation: null,
    isDesktop:
      mobileHint === "?1" ? false : !MOBILE_USER_AGENT.test(userAgent),
  };
}

type BranchHomeRow = { id: number };

// Supabase client type is intentionally loose (matches branch-scope.ts
// canAccessBranch) so both the Edge middleware client and the server client
// can call this helper without deep generic instantiation.
type BranchHomeQueryClient = {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: unknown,
      ): {
        eq(
          column: string,
          value: unknown,
        ): {
          eq(
            column: string,
            value: unknown,
          ): {
            order(
              column: string,
              options: { ascending: boolean },
            ): {
              limit(count: number): {
                maybeSingle(): Promise<{
                  data: BranchHomeRow | null;
                  error: unknown;
                }>;
              };
            };
          };
        };
      };
    };
  };
};

// Per-warm-instance cache, keyed by tenant + central branch_kind (mirrors the
// BRANCH_SURFACE_CACHE pattern in apps/web/proxy.ts). Only successful lookups
// are cached so a transient query error cannot pin a null home.
const CENTRAL_SITE_HOME_CACHE = new Map<string, number | null>();

/**
 * Resolve the home site for central-site operator roles (D055 §1
 * soft-routing). Their JWT claims keep `branch_id` null, so the Branch Hub
 * destination cannot come from claims alone: this helper finds the first
 * active branch matching the role's central `branch_kind`
 * (warehouse_manager → central_supply, production_manager → central_kitchen).
 * Returns null for every other role and for pinned claims.
 */
export async function resolveCentralSiteHomeBranchId(
  supabase: unknown,
  claims: JwtClaims,
): Promise<number | null> {
  const centralKind = centralSiteBranchKindForRole(claims.user_role);
  if (centralKind === null || claims.branch_id !== null) return null;

  const cacheKey = `${String(claims.tenant_id)}:${centralKind}`;
  const cached = CENTRAL_SITE_HOME_CACHE.get(cacheKey);
  if (cached !== undefined) return cached;

  const client = supabase as BranchHomeQueryClient;
  const { data, error } = await client
    .from("branches")
    .select("id")
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_kind", centralKind)
    .eq("is_active", true)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return null;

  const homeBranchId = typeof data?.id === "number" ? data.id : null;
  CENTRAL_SITE_HOME_CACHE.set(cacheKey, homeBranchId);
  return homeBranchId;
}
