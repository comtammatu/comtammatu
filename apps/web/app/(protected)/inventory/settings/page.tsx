import { redirect } from "next/navigation";
import {
  buildAccessDeniedPath,
  PERMISSION_KEYS,
} from "@comtammatu/shared/auth";
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
  const [canOpenSettings, canManageCatalog, canManageUnits] = await Promise.all(
    [
      currentUserHasAnyPermissionAny(INVENTORY_SETTINGS_PERMISSIONS),
      currentUserHasAnyPermissionAny(CATALOG_MANAGE_PERMISSIONS),
      currentUserHasAnyPermissionAny(UNITS_MASTER_PERMISSIONS),
    ],
  );

  if (!canOpenSettings && !canManageCatalog && !canManageUnits) {
    redirect(
      buildAccessDeniedPath("insufficient-permission", {
        from: "/inventory/settings",
      }),
    );
  }

  if (canManageCatalog) redirect("/inventory/settings/categories");
  if (canManageUnits) redirect("/inventory/settings/units");

  redirect(
    buildAccessDeniedPath("insufficient-permission", {
      from: "/inventory/settings",
    }),
  );
}
