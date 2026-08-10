export type ControlSurfaceBranchScope =
  | "all"
  | "office"
  | "company"
  | "branches"
  | `${number}`;

export type ControlSurfaceSiteKind =
  | "branch"
  | "central_supply"
  | "central_kitchen";

const AGGREGATE_SCOPES = new Set<string>([
  "all",
  "office",
  "company",
  "branches",
]);

const SITE_KIND_ORDER: readonly ControlSurfaceSiteKind[] = [
  "branch",
  "central_supply",
  "central_kitchen",
];

function firstRaw(
  raw: string | string[] | null | undefined,
): string | null {
  if (raw == null) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value && value.length > 0 ? value : null;
}

function parseToken(
  value: string,
  allowedIds?: readonly number[],
): ControlSurfaceBranchScope | null {
  if (AGGREGATE_SCOPES.has(value)) {
    return value as ControlSurfaceBranchScope;
  }
  const branchId = Number(value);
  if (!Number.isSafeInteger(branchId) || branchId <= 0) return null;
  if (allowedIds && !allowedIds.includes(branchId)) return null;
  return String(branchId) as ControlSurfaceBranchScope;
}

/**
 * Parse unified `branch` (preferred) or legacy inventory `branchId`.
 */
export function parseControlSurfaceBranchScope(
  rawBranch: string | string[] | null | undefined,
  rawBranchId?: string | string[] | null | undefined,
  options?: {
    allowedIds?: readonly number[];
    fallback?: ControlSurfaceBranchScope;
  },
): ControlSurfaceBranchScope {
  const fallback = options?.fallback ?? "all";
  const primary = firstRaw(rawBranch);
  if (primary) {
    return parseToken(primary, options?.allowedIds) ?? fallback;
  }
  const legacy = firstRaw(rawBranchId);
  if (legacy) {
    // Legacy inventory only used numeric ids; "all" may appear during migration.
    return parseToken(legacy, options?.allowedIds) ?? fallback;
  }
  return fallback;
}

export function resolveScopeFromSearchParams(
  searchParams: { get(key: string): string | null },
  options?: {
    allowedIds?: readonly number[];
    fallback?: ControlSurfaceBranchScope;
  },
): ControlSurfaceBranchScope {
  return parseControlSurfaceBranchScope(
    searchParams.get("branch"),
    searchParams.get("branchId"),
    options,
  );
}

export function getControlSurfaceScopeBranchId(
  scope: ControlSurfaceBranchScope,
): number | null {
  if (AGGREGATE_SCOPES.has(scope)) return null;
  const branchId = Number(scope);
  return Number.isSafeInteger(branchId) && branchId > 0 ? branchId : null;
}

export function isAggregateControlSurfaceScope(
  scope: ControlSurfaceBranchScope,
): boolean {
  return AGGREGATE_SCOPES.has(scope);
}

const DEFAULT_SCOPE_PREFIXES = [
  "/inventory",
  "/hr",
  "/finance",
] as const;

/**
 * Attach `?branch=` (and optional legacy `branchId` for inventory dual-read).
 */
export function withControlSurfaceBranchScope(
  href: string,
  scope: ControlSurfaceBranchScope,
  options?: {
    prefixes?: readonly string[];
    dualInventoryBranchId?: boolean;
  },
): string {
  const [pathname = "", query = ""] = href.split("?", 2);
  const prefixes = options?.prefixes ?? DEFAULT_SCOPE_PREFIXES;
  const inScope = prefixes.some(
    (prefix) =>
      pathname === prefix ||
      pathname.startsWith(`${prefix}/`) ||
      (prefix === "/inventory" && pathname === "/inventory"),
  );
  if (!inScope) return href;

  const params = new URLSearchParams(query);
  params.set("branch", scope);
  const siteId = getControlSurfaceScopeBranchId(scope);
  if (options?.dualInventoryBranchId) {
    if (siteId != null) params.set("branchId", String(siteId));
    else params.delete("branchId");
  }
  const next = params.toString();
  return next ? `${pathname}?${next}` : pathname;
}

export function groupSitesByKind<
  T extends { id: number; name: string; branch_kind: string },
>(sites: readonly T[]): { kind: ControlSurfaceSiteKind; items: T[] }[] {
  const buckets: Record<ControlSurfaceSiteKind, T[]> = {
    branch: [],
    central_supply: [],
    central_kitchen: [],
  };
  for (const site of sites) {
    if (site.branch_kind === "central_supply") {
      buckets.central_supply.push(site);
    } else if (site.branch_kind === "central_kitchen") {
      buckets.central_kitchen.push(site);
    } else if (site.branch_kind === "branch") {
      buckets.branch.push(site);
    }
  }
  return SITE_KIND_ORDER.flatMap((kind) => {
    const items = buckets[kind];
    return items.length > 0 ? [{ kind, items }] : [];
  });
}
