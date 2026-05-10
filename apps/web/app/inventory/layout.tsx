import type { ReactNode } from "react";
import { canAccess, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "../_lib/auth";
import {
  currentUserHasAnyPermissionAny,
  currentUserHasPermissionAny,
} from "../_lib/permissions";
import { InventoryShell } from "./_components/inventory-shell";
import { CATALOG_MANAGE_PERMISSIONS } from "./_lib/catalog-permissions";
import { resolveInventoryBranchScope } from "./_lib/inventory-scope";

export default async function InventoryLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { supabase, session, claims } = await loadAuthState();
  const scope = await resolveInventoryBranchScope(supabase, claims, null);
  const [hasProcurementRead, canManageCatalog] = await Promise.all([
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_READ),
    currentUserHasAnyPermissionAny(CATALOG_MANAGE_PERMISSIONS),
  ]);
  const isOversightRole =
    claims.user_role === "owner" || claims.user_role === "area_manager";
  const showProcurement =
    !isOversightRole &&
    canAccess(claims.user_role, "inventory_procurement") &&
    hasProcurementRead;

  const defaultBranch = scope.allowedBranches.find(
    (b) => b.id === scope.selectedBranchId,
  );
  const siteName =
    defaultBranch?.name ??
    (claims.user_role === "super_manager" ||
    claims.user_role === "owner" ||
    claims.user_role === "office"
      ? "Kho tổng"
      : "Điểm vận hành");
  const siteKind: string =
    defaultBranch?.branch_kind ??
    (claims.user_role === "super_manager" ||
    claims.user_role === "owner" ||
    claims.user_role === "office"
      ? "central_warehouse"
      : "branch");

  return (
    <InventoryShell
      user={{
        name:
          session.user.user_metadata?.["display_name"] ??
          session.user.email ??
          "",
      }}
      userRole={claims.user_role}
      siteName={siteName}
      siteKind={siteKind}
      showProcurement={showProcurement}
      showCatalogManagement={canManageCatalog}
      allowedBranches={scope.allowedBranches}
      defaultBranchId={scope.selectedBranchId}
    >
      {children}
    </InventoryShell>
  );
}
