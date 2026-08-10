import { cache } from "react";
import {
  requiredOperatorBranchKindForRole,
  type BranchKind,
  type JwtClaims,
  type StaffRole,
} from "@comtammatu/shared/auth";
import {
  getControlSurfaceScopeBranchId,
  parseControlSurfaceBranchScope,
} from "@/lib/control-surface-scope";

export interface OperatorBranchOption {
  id: number;
  name: string;
  branch_kind: string;
}

export interface BranchScope {
  allowedBranches: OperatorBranchOption[];
  canSelectAll: boolean;
  /** `all` only when tenant-wide role requested explicit all-sites scope. */
  scopeMode: "all" | "site";
  selectedBranchId: number | null;
  defaultBranchId: number | null;
}

export interface BranchScopeSelection {
  allowedBranches: OperatorBranchOption[];
  currentBranchId: number | null;
  defaultBranchId: number | null;
}

export interface BranchContext extends BranchScopeSelection {
  tenantId: number;
  branchId: number;
  branch: OperatorBranchOption;
  role: StaffRole;
}

interface BranchQueryResponse {
  data: OperatorBranchOption[] | null;
  error: unknown;
}

interface BranchQueryBuilder {
  eq(column: string, value: unknown): BranchQueryBuilder;
  order(column: string): Promise<BranchQueryResponse>;
}

interface BranchSelectBuilder {
  select(columns: string): BranchQueryBuilder;
}

interface BranchContextClient {
  from(table: string): BranchSelectBuilder;
}

const OPERATOR_TENANT_WIDE_ROLES: readonly StaffRole[] = ["owner"];

function operatorBranchesForRole(
  branches: readonly OperatorBranchOption[],
  role: StaffRole,
): OperatorBranchOption[] {
  const requiredKind = requiredOperatorBranchKindForRole(role);
  if (requiredKind === null) return [...branches];
  return branches.filter(
    (branch) => (branch.branch_kind as BranchKind) === requiredKind,
  );
}

function pickDefaultBranchId(
  branches: readonly OperatorBranchOption[],
  preferredBranchId: number | null,
): number | null {
  if (
    preferredBranchId != null &&
    branches.some((branch) => branch.id === preferredBranchId)
  ) {
    return preferredBranchId;
  }

  return branches[0]?.id ?? null;
}

/**
 * Single branch-scope engine shared by operator and inventory scoping.
 * Tenant-wide roles see every provided branch; other roles are locked to
 * `claims.branch_id`. Explicit `requestAll` (URL `branch=all`) yields
 * `scopeMode: "all"` with `selectedBranchId: null` for list/report reads.
 * Missing request still defaults to a concrete site — never silent-all.
 */
export function selectBranchScope(
  claims: JwtClaims,
  branches: readonly OperatorBranchOption[],
  requestedBranchId: number | null,
  tenantWideRoles: readonly StaffRole[],
  options?: { requestAll?: boolean },
): BranchScope {
  const canSelectAll = tenantWideRoles.includes(claims.user_role);
  const allowedBranches = canSelectAll
    ? [...branches]
    : branches.filter((branch) => branch.id === claims.branch_id);
  const defaultBranchId = pickDefaultBranchId(
    allowedBranches,
    claims.branch_id,
  );

  if (options?.requestAll && canSelectAll) {
    return {
      allowedBranches,
      canSelectAll,
      scopeMode: "all",
      selectedBranchId: null,
      defaultBranchId,
    };
  }

  const selectedBranchId =
    requestedBranchId != null &&
    allowedBranches.some((branch) => branch.id === requestedBranchId)
      ? requestedBranchId
      : defaultBranchId;

  return {
    allowedBranches,
    canSelectAll,
    scopeMode: "site",
    selectedBranchId,
    defaultBranchId,
  };
}

/**
 * Branch home scope is tenant-wide for Owner. Store roles operate
 * `branch_kind = "branch"`; central_supply_ops / central_kitchen_lead operate
 * their pinned central site kind. Owner may browse every active site kind.
 */
export function selectOperatorBranchScope(
  claims: JwtClaims,
  branches: readonly OperatorBranchOption[],
  requestedBranchId: number | null,
): BranchScopeSelection {
  const operableBranches = operatorBranchesForRole(branches, claims.user_role);
  const scope = selectBranchScope(
    claims,
    operableBranches,
    requestedBranchId,
    OPERATOR_TENANT_WIDE_ROLES,
  );

  return {
    allowedBranches: scope.allowedBranches,
    currentBranchId: scope.selectedBranchId,
    defaultBranchId: scope.defaultBranchId,
  };
}

export const fetchActiveBranches = cache(async function fetchActiveBranches(
  supabase: unknown,
  tenantId: number,
): Promise<OperatorBranchOption[]> {
  const client = supabase as BranchContextClient;
  const { data, error } = await client
    .from("branches")
    .select("id, name, branch_kind")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("id");

  if (error) return [];
  return data ?? [];
});

/**
 * Parse a raw `branchId` query-param value. Returns null for missing,
 * malformed, or explicit aggregate tokens (`all`).
 */
export function parseBranchIdParam(
  raw: string | string[] | undefined,
): number | null {
  if (raw == null) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || value === "all") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

export interface ListScopeResolution extends BranchScope {
  /** True when an embedded (routeBranchId) caller resolved to a different
   * branch than requested — caller must `notFound()`. */
  outOfScope: boolean;
}

/**
 * Single scope-read entry point for shared `*PageContent` list/report
 * surfaces (D058 W3b). Embedded callers pass the validated `routeBranchId`
 * from the URL segment; it always wins, and a mismatch against the
 * resolved scope means the branch is not allowed for this user — the
 * caller must `notFound()`. Owner surface callers pass raw `?branch=` /
 * legacy `?branchId=` query values; they survive ONLY as a display
 * filter/default — never as write authority. Writes MUST re-derive their
 * own scope from claims/RLS/RPC permission checks, not from this resolution.
 */
export async function resolveListScope(
  supabase: unknown,
  claims: JwtClaims,
  branches: readonly OperatorBranchOption[],
  options: {
    routeBranchId?: number;
    queryBranchId?: string | string[] | undefined;
    /** Unified Control Surface `?branch=` (preferred over queryBranchId). */
    queryBranch?: string | string[] | undefined;
    tenantWideRoles: readonly StaffRole[];
  },
): Promise<ListScopeResolution> {
  void supabase;
  if (options.routeBranchId != null) {
    const scope = selectBranchScope(
      claims,
      branches,
      options.routeBranchId,
      options.tenantWideRoles,
    );
    return {
      ...scope,
      outOfScope: scope.selectedBranchId !== options.routeBranchId,
    };
  }

  const token = parseControlSurfaceBranchScope(
    options.queryBranch,
    options.queryBranchId,
    {
      allowedIds: branches.map((branch) => branch.id),
      fallback: "all",
    },
  );
  // Inventory list engine only distinguishes all vs concrete site.
  // office/company/branches aggregate tokens map to all-sites read.
  const requestAll =
    token === "all" ||
    token === "office" ||
    token === "company" ||
    token === "branches";
  const requestedBranchId = getControlSurfaceScopeBranchId(token);
  const scope = selectBranchScope(
    claims,
    branches,
    requestedBranchId,
    options.tenantWideRoles,
    { requestAll },
  );

  return {
    ...scope,
    outOfScope: false,
  };
}

export const resolveBranchContext = cache(async function resolveBranchContext(
  supabase: unknown,
  claims: JwtClaims,
  requestedBranchId: number | null,
): Promise<BranchContext | null> {
  const branches = await fetchActiveBranches(supabase, claims.tenant_id);
  const selection = selectOperatorBranchScope(
    claims,
    branches,
    requestedBranchId,
  );
  if (selection.currentBranchId == null) return null;
  if (
    requestedBranchId != null &&
    selection.currentBranchId !== requestedBranchId
  ) {
    return null;
  }

  const branch =
    selection.allowedBranches.find(
      (candidate) => candidate.id === selection.currentBranchId,
    ) ?? null;
  if (!branch) return null;

  return {
    ...selection,
    tenantId: claims.tenant_id,
    branchId: branch.id,
    branch,
    role: claims.user_role,
  };
});
