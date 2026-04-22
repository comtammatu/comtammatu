import type { ReactNode } from "react";
import { canAccess, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "../_lib/auth";
import {
  currentUserHasAnyPermissionAny,
  currentUserHasPermissionAny,
} from "../_lib/permissions";
import { InventoryShell } from "./_components/inventory-shell";
import { fetchInventorySiteContext } from "./_lib/procurement-branches";
import {
  canAccessProductionSurface,
  hasCurrentProductionBranchAccess,
  PRODUCTION_OPEN_PERMISSIONS,
} from "./production-data";

const CATALOG_MANAGE_PERMISSIONS = [
  PERMISSION_KEYS.PROCUREMENT_SUPPLIER_MANAGE,
  PERMISSION_KEYS.INVENTORY_PRODUCTION_CREATE,
] as const;

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
  const siteContext = await fetchInventorySiteContext(
    supabase,
    claims.tenant_id,
    claims.branch_id,
  );
  const [
    hasProcurementRead,
    canManageCatalog,
    canOpenSettings,
    hasProductionPermission,
    hasProductionBranchAccess,
  ] =
    await Promise.all([
      currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_READ),
      currentUserHasAnyPermissionAny(CATALOG_MANAGE_PERMISSIONS),
      currentUserHasAnyPermissionAny(INVENTORY_SETTINGS_PERMISSIONS),
      currentUserHasAnyPermissionAny(PRODUCTION_OPEN_PERMISSIONS),
      hasCurrentProductionBranchAccess(supabase, claims),
    ]);
  const showProcurement =
    canAccess(claims.user_role, "inventory_procurement") &&
    hasProcurementRead;
  const showProduction =
    canAccessProductionSurface(claims.user_role) &&
    hasProductionPermission &&
    hasProductionBranchAccess;
  const resolvedSiteContext =
    siteContext ??
    (claims.user_role === "super_manager" ||
    claims.user_role === "owner" ||
    claims.user_role === "office"
        ? {
          branchName: "Kho tổng",
          branchKind: "central_warehouse" as const,
        }
      : {
          branchName: "Điểm vận hành",
          branchKind: "branch" as const,
        });

  return (
    <InventoryShell
      user={{
        name:
          session.user.user_metadata?.["display_name"] ??
          session.user.email ??
          "",
      }}
      userRole={claims.user_role}
      siteName={resolvedSiteContext.branchName}
      siteKind={resolvedSiteContext.branchKind}
      showProcurement={showProcurement}
      showProduction={showProduction}
      showCatalogManagement={canManageCatalog}
      showSettings={canOpenSettings}
    >
      {children}
    </InventoryShell>
  );
}
