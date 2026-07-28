import type { StaffRole } from "@comtammatu/shared/auth";

export const PRODUCTION_OPERATOR_ROLES = [
  "owner",
  "central_kitchen_lead",
] as const satisfies readonly StaffRole[];

export const PRODUCTION_RECIPE_MANAGER_ROLES = [
  "owner",
  "central_kitchen_lead",
] as const satisfies readonly StaffRole[];

const PRODUCTION_BRANCH_SCOPED_ROLES = [
  "central_kitchen_lead",
] as const satisfies readonly StaffRole[];

/**
 * Site kinds that may run production (D093): central kitchen only.
 * Branch production removed.
 */
export const PRODUCTION_BRANCH_KINDS = [
  "central_kitchen",
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
export type ProductionRecipeManagerRole =
  (typeof PRODUCTION_RECIPE_MANAGER_ROLES)[number];
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

export function canManageProductionRecipes(
  role: StaffRole | null | undefined,
): role is ProductionRecipeManagerRole {
  return (
    role != null &&
    PRODUCTION_RECIPE_MANAGER_ROLES.includes(
      role as ProductionRecipeManagerRole,
    )
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
