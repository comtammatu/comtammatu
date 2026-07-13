import { cache } from "react";
import type { JwtClaims, StaffRole } from "@comtammatu/shared/auth";

export interface OperatorBranchOption {
  id: number;
  name: string;
  branch_kind: string;
}

export interface BranchScope {
  allowedBranches: OperatorBranchOption[];
  canSelectAll: boolean;
  selectedBranchId: number | null;
  defaultBranchId: number | null;
}

export interface BranchScopeSelection {
  allowedBranches: OperatorBranchOption[];
  currentBranchId: number | null;
  defaultBranchId: number | null;
  canSwitchBranch: boolean;
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

function operatorBranches(
  branches: readonly OperatorBranchOption[],
  operableKind: string,
): OperatorBranchOption[] {
  return branches.filter((branch) => branch.branch_kind === operableKind);
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
 * `claims.branch_id`. The requested branch wins only when allowed; the
 * default is the user's own branch when allowed, else the first allowed.
 */
export function selectBranchScope(
  claims: JwtClaims,
  branches: readonly OperatorBranchOption[],
  requestedBranchId: number | null,
  tenantWideRoles: readonly StaffRole[],
): BranchScope {
  const canSelectAll = tenantWideRoles.includes(claims.user_role);
  const allowedBranches = canSelectAll
    ? [...branches]
    : branches.filter((branch) => branch.id === claims.branch_id);
  const defaultBranchId = pickDefaultBranchId(
    allowedBranches,
    claims.branch_id,
  );
  const selectedBranchId =
    requestedBranchId != null &&
    allowedBranches.some((branch) => branch.id === requestedBranchId)
      ? requestedBranchId
      : defaultBranchId;

  return {
    allowedBranches,
    canSelectAll,
    selectedBranchId,
    defaultBranchId,
  };
}

/**
 * Branch Hub scope is tenant-wide for privileged roles, but every role only
 * operates active sites whose branch_kind is "branch" (D077).
 */
export function selectOperatorBranchScope(
  claims: JwtClaims,
  branches: readonly OperatorBranchOption[],
  requestedBranchId: number | null,
): BranchScopeSelection {
  const operableBranches = operatorBranches(branches, "branch");
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
    canSwitchBranch: scope.allowedBranches.length > 1,
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
 * Parse a raw `branchId` query-param value. Returns null for missing or
 * malformed values (non-numeric, <=0).
 */
export function parseBranchIdParam(
  raw: string | string[] | undefined,
): number | null {
  if (raw == null) return null;
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
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
   * caller must `notFound()`. Admin Dashboard callers pass the raw `?branchId=` query
 * value instead; it survives ONLY as a display filter/default — never as
 * write authority. Writes MUST re-derive their own scope from
 * claims/RLS/RPC permission checks, not from this resolution.
 */
export async function resolveListScope(
  supabase: unknown,
  claims: JwtClaims,
  branches: readonly OperatorBranchOption[],
  options: {
    routeBranchId?: number;
    queryBranchId?: string | string[] | undefined;
    tenantWideRoles: readonly StaffRole[];
  },
): Promise<ListScopeResolution> {
  const requestedBranchId =
    options.routeBranchId ?? parseBranchIdParam(options.queryBranchId);
  const scope = selectBranchScope(
    claims,
    branches,
    requestedBranchId,
    options.tenantWideRoles,
  );

  return {
    ...scope,
    outOfScope:
      options.routeBranchId != null &&
      scope.selectedBranchId !== options.routeBranchId,
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
