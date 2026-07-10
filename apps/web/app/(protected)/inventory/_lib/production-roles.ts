import type { StaffRole } from "@comtammatu/shared/auth";

export const PRODUCTION_OPERATOR_ROLES = [
  "owner",
  "production_manager",
  "branch_manager",
] as const satisfies readonly StaffRole[];

const PRODUCTION_BRANCH_SCOPED_ROLES = [
  "production_manager",
  "branch_manager",
] as const satisfies readonly StaffRole[];

/**
 * Branch kinds that may run production (D068): the central kitchen plus any
 * branch (`branch_manager` produces at its own branch warehouse). Single source for the
 * production branch-kind gate used by both the surface loader
 * (`hasCurrentProductionBranchAccess`) and the order guard
 * (`requireProductionBranch`) — no drift between the two.
 */
export const PRODUCTION_BRANCH_KINDS = [
  "central_kitchen",
  "branch",
] as const satisfies readonly string[];

export function isProductionBranchKind(
  kind: string | null | undefined,
): boolean {
  return (
    kind != null &&
    (PRODUCTION_BRANCH_KINDS as readonly string[]).includes(kind)
  );
}

export type ProductionOperatorRole = (typeof PRODUCTION_OPERATOR_ROLES)[number];
export type ProductionBranchScopedRole =
  (typeof PRODUCTION_BRANCH_SCOPED_ROLES)[number];

export function canAccessProductionSurface(
  role: StaffRole | null | undefined,
): role is ProductionOperatorRole {
  return (
    role != null &&
    PRODUCTION_OPERATOR_ROLES.includes(role as ProductionOperatorRole)
  );
}

export function isProductionBranchScopedRole(
  role: StaffRole | null | undefined,
): role is ProductionBranchScopedRole {
  return (
    role != null &&
    PRODUCTION_BRANCH_SCOPED_ROLES.includes(role as ProductionBranchScopedRole)
  );
}
