import type { ReactNode } from "react";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import {
  currentUserHasAnyPermissionAny,
  currentUserHasPermissionAny,
} from "@/_lib/permissions";
import { ControlSurfaceShell } from "@/components/control-surface-shell";
import { BranchOpsRefresh } from "@/(protected)/br/[branchId]/(operator)/branch-ops-refresh";
import {
  CATALOG_MANAGE_PERMISSIONS,
  CATALOG_READ_PERMISSIONS,
} from "./_lib/catalog-permissions";
import { resolveInventoryBranchScope } from "./_lib/inventory-scope";
import {
  canAccessProductionSurface,
  hasCurrentProductionBranchAccess,
  PRODUCTION_OPEN_PERMISSIONS,
} from "./production-data";

const INVENTORY_SETTINGS_PERMISSIONS = [
  PERMISSION_KEYS.SETTINGS_BRANCH,
  PERMISSION_KEYS.SETTINGS_TENANT,
  PERMISSION_KEYS.SETTINGS_INTEGRATIONS,
] as const;

export default async function InventoryLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { supabase, session, claims } = await loadAuthState();
  const scope = await resolveInventoryBranchScope(supabase, claims, null);
  const [
    hasProcurementRead,
    canManageCatalog,
    canReadCatalog,
    canOpenSettings,
    hasProductionPermission,
    hasProductionBranchAccess,
  ] = await Promise.all([
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_READ),
    currentUserHasAnyPermissionAny(CATALOG_MANAGE_PERMISSIONS),
    currentUserHasAnyPermissionAny(CATALOG_READ_PERMISSIONS),
    currentUserHasAnyPermissionAny(INVENTORY_SETTINGS_PERMISSIONS),
    currentUserHasAnyPermissionAny(PRODUCTION_OPEN_PERMISSIONS),
    hasCurrentProductionBranchAccess(supabase, claims),
  ]);
  const isOwner = claims.user_role === "owner";
  const isCentralCatalogViewer =
    claims.user_role === "central_supply_ops" ||
    claims.user_role === "central_kitchen_lead";
  const showProcurement = isOwner || hasProcurementRead;
  const showProduction =
    isOwner ||
    (canAccessProductionSurface(claims.user_role) &&
      hasProductionPermission &&
      hasProductionBranchAccess);
  // Catalog CRUD stays owner. Central ops browse ingredients via showCatalogRead.
  const showCatalogManagement = isOwner && canManageCatalog;
  const showCatalogRead =
    !showCatalogManagement && isCentralCatalogViewer && canReadCatalog;

  return (
    <>
      {scope.selectedBranchId && (
        <BranchOpsRefresh branchId={scope.selectedBranchId} />
      )}
      <ControlSurfaceShell
        module="inventory"
        user={{
          name:
            session.user.user_metadata?.["display_name"] ??
            session.user.email ??
            "",
        }}
        role={claims.user_role}
        homeBranchId={scope.selectedBranchId}
        inventory={{
          showProcurement,
          showProduction,
          showCatalogManagement,
          showCatalogRead,
          showSettings: isOwner || canOpenSettings,
          allowedBranches: scope.allowedBranches,
          defaultBranchId: scope.selectedBranchId,
        }}
      >
        {children}
      </ControlSurfaceShell>
    </>
  );
}
