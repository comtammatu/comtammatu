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
  const [hasProcurementRead, canManageCatalog, canOpenSettings] =
    await Promise.all([
      currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_READ),
      currentUserHasAnyPermissionAny(CATALOG_MANAGE_PERMISSIONS),
      currentUserHasAnyPermissionAny(INVENTORY_SETTINGS_PERMISSIONS),
    ]);
  const isOversightRole =
    claims.user_role === "owner" || claims.user_role === "manager";
  const showProcurement =
    !isOversightRole &&
    canAccess(claims.user_role, "inventory_procurement") &&
    hasProcurementRead;

  const defaultBranch = scope.allowedBranches.find(
    (b) => b.id === scope.selectedBranchId,
  );
  // HKD lean: HQ/warehouse default applies to owner/manager only (former
  // "office"/"super_manager" arms). The "office" arm collapsed into "staff",
  // which also covers branch staff, so it is dropped here to avoid defaulting
  // every staff user to the central-warehouse label (display fallback only).
  const isHqDefaultRole =
    claims.user_role === "manager" || claims.user_role === "owner";
  const siteName =
    defaultBranch?.name ?? (isHqDefaultRole ? "Kho tổng" : "Điểm vận hành");
  const siteKind: string =
    defaultBranch?.branch_kind ??
    (isHqDefaultRole ? "central_warehouse" : "branch");

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
      showSettings={canOpenSettings}
      allowedBranches={scope.allowedBranches}
      defaultBranchId={scope.selectedBranchId}
    >
      {children}
    </InventoryShell>
  );
}
