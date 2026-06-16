import type { StaffRole } from "@comtammatu/shared/auth";

export const PRODUCTION_OPERATOR_ROLES = [
  "owner",
  "production_manager",
] as const satisfies readonly StaffRole[];

const PRODUCTION_BRANCH_SCOPED_ROLES = [
  "production_manager",
] as const satisfies readonly StaffRole[];

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
