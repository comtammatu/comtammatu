import { redirect } from "next/navigation";
import {
  buildAccessDeniedPath,
  PERMISSION_KEYS,
  SUPPLIER_RETURN_ROLES,
} from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasAnyPermissionAny } from "@/_lib/permissions";
import {
  CATALOG_MANAGE_PERMISSIONS,
  UNITS_MASTER_PERMISSIONS,
} from "../_lib/catalog-permissions";

const INVENTORY_SETTINGS_PERMISSIONS = [
  PERMISSION_KEYS.SETTINGS_BRANCH,
  PERMISSION_KEYS.SETTINGS_TENANT,
  PERMISSION_KEYS.SETTINGS_INTEGRATIONS,
] as const;

export default async function InventorySettingsPage() {
  const [
    { claims },
    canOpenSettings,
    canManageCatalog,
    canManageUnits,
    canManageTenantSettings,
  ] = await Promise.all([
    loadAuthState(),
    currentUserHasAnyPermissionAny(INVENTORY_SETTINGS_PERMISSIONS),
    currentUserHasAnyPermissionAny(CATALOG_MANAGE_PERMISSIONS),
    currentUserHasAnyPermissionAny(UNITS_MASTER_PERMISSIONS),
    currentUserHasAnyPermissionAny([PERMISSION_KEYS.SETTINGS_TENANT]),
  ]);

  if (!canOpenSettings) {
    redirect(
      buildAccessDeniedPath("insufficient-permission", {
        from: "/inventory/settings",
      }),
    );
  }

  if (canManageCatalog) redirect("/inventory/settings/categories");
  if (canManageUnits) redirect("/inventory/settings/units");
  if (
    canManageTenantSettings &&
    SUPPLIER_RETURN_ROLES.includes(claims.user_role)
  ) {
    redirect("/inventory/settings/qc");
  }

  redirect(
    buildAccessDeniedPath("insufficient-permission", {
      from: "/inventory/settings",
    }),
  );
}
