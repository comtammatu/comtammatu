import type { ReactNode } from "react";
import { canAccess, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import {
  currentUserHasAnyPermissionAny,
  currentUserHasPermissionAny,
} from "@/_lib/permissions";
import { InventoryShell } from "./_components/inventory-shell";
import { BranchOpsRefresh } from "@/(protected)/br/[branchId]/(operator)/branch-ops-refresh";
import { CATALOG_MANAGE_PERMISSIONS } from "./_lib/catalog-permissions";
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
    canOpenSettings,
    hasProductionPermission,
    hasProductionBranchAccess,
  ] = await Promise.all([
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_READ),
    currentUserHasAnyPermissionAny(CATALOG_MANAGE_PERMISSIONS),
    currentUserHasAnyPermissionAny(INVENTORY_SETTINGS_PERMISSIONS),
    currentUserHasAnyPermissionAny(PRODUCTION_OPEN_PERMISSIONS),
    hasCurrentProductionBranchAccess(supabase, claims),
  ]);
  const isOwner = claims.user_role === "owner";
  const showProcurement =
    isOwner ||
    (canAccess(claims.user_role, "branch_stock") && hasProcurementRead);
  const showProduction =
    isOwner ||
    (canAccessProductionSurface(claims.user_role) &&
      hasProductionPermission &&
      hasProductionBranchAccess);

  return (
    <>
      {scope.selectedBranchId && (
        <BranchOpsRefresh branchId={scope.selectedBranchId} />
      )}
      <InventoryShell
        user={{
          name:
            session.user.user_metadata?.["display_name"] ??
            session.user.email ??
            "",
        }}
        userRole={claims.user_role}
        showProcurement={showProcurement}
        showProduction={showProduction}
        showCatalogManagement={isOwner || canManageCatalog}
        showSettings={isOwner || canOpenSettings}
        allowedBranches={scope.allowedBranches}
        defaultBranchId={scope.selectedBranchId}
      >
        {children}
      </InventoryShell>
    </>
  );
}
