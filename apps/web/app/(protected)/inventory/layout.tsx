import type { ReactNode } from "react";
import { canAccess, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import {
  currentUserHasAnyPermissionAny,
  currentUserHasPermissionAny,
} from "@/_lib/permissions";
import { InventoryShell } from "./_components/inventory-shell";
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
    canApproveWaste,
    canManageCounts,
  ] = await Promise.all([
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_READ),
    currentUserHasAnyPermissionAny(CATALOG_MANAGE_PERMISSIONS),
    currentUserHasAnyPermissionAny(INVENTORY_SETTINGS_PERMISSIONS),
    currentUserHasAnyPermissionAny(PRODUCTION_OPEN_PERMISSIONS),
    hasCurrentProductionBranchAccess(supabase, claims),
    currentUserHasPermissionAny(PERMISSION_KEYS.INVENTORY_WASTE_APPROVE),
    currentUserHasAnyPermissionAny([
      PERMISSION_KEYS.INVENTORY_COUNT_ASSIGN,
      PERMISSION_KEYS.INVENTORY_COUNT_APPROVE,
    ]),
  ]);
  const isOwner = claims.user_role === "owner";
  const showProcurement =
    isOwner ||
    (canAccess(claims.user_role, "inventory_procurement") &&
      hasProcurementRead);
  const showProduction =
    isOwner ||
    (canAccessProductionSurface(claims.user_role) &&
      hasProductionPermission &&
      hasProductionBranchAccess);
  const showWasteApprovals = isOwner || canApproveWaste;

  const defaultBranch = scope.allowedBranches.find(
    (b) => b.id === scope.selectedBranchId,
  );
  const siteKind: string = defaultBranch?.branch_kind ?? "branch";

  return (
    <InventoryShell
      user={{
        name:
          session.user.user_metadata?.["display_name"] ??
          session.user.email ??
          "",
      }}
      userRole={claims.user_role}
      siteKind={siteKind}
      showProcurement={showProcurement}
      showProduction={showProduction}
      showCatalogManagement={isOwner || canManageCatalog}
      showSettings={isOwner || canOpenSettings}
      showWasteApprovals={showWasteApprovals}
      showCountManagement={isOwner || canManageCounts}
      allowedBranches={scope.allowedBranches}
      defaultBranchId={scope.selectedBranchId}
    >
      {children}
    </InventoryShell>
  );
}
