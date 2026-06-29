import { cache } from "react";
import type { JwtClaims, StaffRole } from "@comtammatu/shared/auth";

export interface OperatorBranchOption {
  id: number;
  name: string;
  branch_kind: string;
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

function operatorBranches(
  branches: readonly OperatorBranchOption[],
): OperatorBranchOption[] {
  return branches.filter((branch) => branch.branch_kind === "branch");
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

export function selectOperatorBranchScope(
  claims: JwtClaims,
  branches: readonly OperatorBranchOption[],
  requestedBranchId: number | null,
): BranchScopeSelection {
  const activeOperatorBranches = operatorBranches(branches);
  const allowedBranches =
    claims.user_role === "owner"
      ? activeOperatorBranches
      : activeOperatorBranches.filter(
          (branch) => branch.id === claims.branch_id,
        );
  const defaultBranchId = pickDefaultBranchId(
    allowedBranches,
    claims.branch_id,
  );
  const currentBranchId =
    requestedBranchId != null &&
    allowedBranches.some((branch) => branch.id === requestedBranchId)
      ? requestedBranchId
      : defaultBranchId;

  return {
    allowedBranches,
    currentBranchId,
    defaultBranchId,
    canSwitchBranch: allowedBranches.length > 1,
  };
}

export const resolveBranchContext = cache(async function resolveBranchContext(
  supabase: unknown,
  claims: JwtClaims,
  requestedBranchId: number | null,
): Promise<BranchContext | null> {
  const client = supabase as BranchContextClient;
  const { data, error } = await client
    .from("branches")
    .select("id, name, branch_kind")
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .eq("branch_kind", "branch")
    .order("id");

  if (error) return null;

  const selection = selectOperatorBranchScope(
    claims,
    data ?? [],
    requestedBranchId,
  );
  if (selection.currentBranchId == null) return null;

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
