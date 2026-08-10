import type { ReactNode } from "react";
import {
  PERMISSION_KEYS,
  canAccess,
  canonicalizeSelfServicePath,
} from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import {
  currentUserHasAnyPermissionAny,
  currentUserHasPermission,
  currentUserHasPermissionAny,
} from "@/_lib/permissions";
import { ControlSurfaceShell } from "@/components/control-surface-shell";
import { fetchActiveBranches } from "@/_lib/branch-context";
import {
  CATALOG_MANAGE_PERMISSIONS,
  CATALOG_READ_PERMISSIONS,
} from "./inventory/_lib/catalog-permissions";
import { resolveInventoryBranchScope } from "./inventory/_lib/inventory-scope";
import {
  canAccessProductionSurface,
  hasCurrentProductionBranchAccess,
  PRODUCTION_OPEN_PERMISSIONS,
} from "./inventory/production-data";

const INVENTORY_SETTINGS_PERMISSIONS = [
  PERMISSION_KEYS.SETTINGS_BRANCH,
  PERMISSION_KEYS.SETTINGS_TENANT,
  PERMISSION_KEYS.SETTINGS_INTEGRATIONS,
] as const;

export default async function ProtectedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { supabase, user, claims } = await loadAuthState();
  const role = claims.user_role;
  const isOwner = role === "owner";
  const canOpenInventory = canAccess(role, "inventory");
  const canOpenFinance = canAccess(role, "finance");
  const denied = Promise.resolve(false);
  const granted = Promise.resolve(true);

  const [
    inventoryScope,
    activeBranches,
    hasProcurementRead,
    canManageCatalog,
    canReadCatalog,
    canOpenInventorySettings,
    hasProductionPermission,
    hasProductionBranchAccess,
    showInvoices,
    showSupplierPayables,
    canOpenHr,
    canOpenHrPayroll,
  ] = await Promise.all([
    canOpenInventory
      ? resolveInventoryBranchScope(supabase, claims, null)
      : Promise.resolve(null),
    fetchActiveBranches(supabase, claims.tenant_id),
    isOwner
      ? granted
      : canOpenInventory
        ? currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_READ)
        : denied,
    isOwner
      ? granted
      : canOpenInventory
        ? currentUserHasAnyPermissionAny(CATALOG_MANAGE_PERMISSIONS)
        : denied,
    isOwner
      ? denied
      : canOpenInventory
        ? currentUserHasAnyPermissionAny(CATALOG_READ_PERMISSIONS)
        : denied,
    isOwner
      ? granted
      : canOpenInventory
        ? currentUserHasAnyPermissionAny(INVENTORY_SETTINGS_PERMISSIONS)
        : denied,
    isOwner
      ? granted
      : canOpenInventory
        ? currentUserHasAnyPermissionAny(PRODUCTION_OPEN_PERMISSIONS)
        : denied,
    isOwner
      ? granted
      : canOpenInventory
        ? hasCurrentProductionBranchAccess(supabase, claims)
        : denied,
    isOwner
      ? granted
      : canOpenFinance
        ? currentUserHasPermissionAny(PERMISSION_KEYS.FINANCE_VIEW)
        : denied,
    isOwner
      ? granted
      : canOpenFinance
        ? currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_READ)
        : denied,
    currentUserHasPermission(null, PERMISSION_KEYS.HR_VIEW_EMPLOYEE),
    currentUserHasPermission(null, PERMISSION_KEYS.HR_PAYROLL_PREPARE),
  ]);

  const isCentralCatalogViewer =
    role === "central_supply_ops" || role === "central_kitchen_lead";
  const showCatalogManagement = isOwner && canManageCatalog;
  const salesBranches = activeBranches.filter(
    (branch) => branch.branch_kind === "branch",
  );
  const hrBranches = isOwner
    ? activeBranches
    : activeBranches.filter((branch) => branch.id === claims.branch_id);

  return (
    <ControlSurfaceShell
      user={{
        name: user?.user_metadata?.["display_name"] ?? user?.email ?? "",
      }}
      role={role}
      homeBranchId={claims.branch_id}
      personalHref={canonicalizeSelfServicePath(claims, "/me") ?? undefined}
      inventory={{
        showProcurement: isOwner || hasProcurementRead,
        showProduction:
          isOwner ||
          (canAccessProductionSurface(role) &&
            hasProductionPermission &&
            hasProductionBranchAccess),
        showCatalogManagement,
        showCatalogRead:
          !showCatalogManagement && isCentralCatalogViewer && canReadCatalog,
        showSettings: isOwner || canOpenInventorySettings,
        allowedBranches: inventoryScope?.allowedBranches ?? [],
        defaultBranchId: inventoryScope?.defaultBranchId ?? claims.branch_id,
        canSelectAll: inventoryScope?.canSelectAll ?? false,
      }}
      finance={{
        showInvoices,
        showSupplierPayables,
        showRevenueTargets: isOwner,
        branches: isOwner
          ? salesBranches
          : salesBranches.filter((branch) => branch.id === claims.branch_id),
        canSelectAll: isOwner,
      }}
      hr={{
        canOpen: canOpenHr,
        canOpenPayroll: canOpenHrPayroll,
        branches: hrBranches,
        canSelectAll: isOwner,
      }}
    >
      {children}
    </ControlSurfaceShell>
  );
}
