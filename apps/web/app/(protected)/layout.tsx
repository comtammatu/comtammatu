import type { ReactNode } from "react";
import { PERMISSION_KEYS, canAccess } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import {
  currentUserHasAnyPermissionAny,
  currentUserHasPermissionAny,
} from "@/_lib/permissions";
import { ControlSurfaceShell } from "@/components/control-surface-shell";
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
    hasProcurementRead,
    canManageCatalog,
    canReadCatalog,
    canOpenInventorySettings,
    hasProductionPermission,
    hasProductionBranchAccess,
    showInvoices,
    showSupplierPayables,
  ] = await Promise.all([
    canOpenInventory
      ? resolveInventoryBranchScope(supabase, claims, null)
      : Promise.resolve(null),
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
  ]);

  const isCentralCatalogViewer =
    role === "central_supply_ops" || role === "central_kitchen_lead";
  const showCatalogManagement = isOwner && canManageCatalog;

  return (
    <ControlSurfaceShell
      user={{
        name: user?.user_metadata?.["display_name"] ?? user?.email ?? "",
      }}
      role={role}
      homeBranchId={claims.branch_id}
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
        defaultBranchId: inventoryScope?.selectedBranchId ?? claims.branch_id,
      }}
      finance={{
        showInvoices,
        showSupplierPayables,
        showRevenueTargets: isOwner,
        showCostClose: isOwner,
      }}
    >
      {children}
    </ControlSurfaceShell>
  );
}
