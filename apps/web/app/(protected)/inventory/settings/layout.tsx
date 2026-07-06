import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import {
  buildAccessDeniedPath,
  PERMISSION_KEYS,
  SUPPLIER_RETURN_ROLES,
} from "@comtammatu/shared/auth";
import { AppPage } from "@/components/surface";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasAnyPermissionAny } from "@/_lib/permissions";
import {
  CATALOG_MANAGE_PERMISSIONS,
  UNITS_MASTER_PERMISSIONS,
} from "../_lib/catalog-permissions";
import { tRoute } from "../_lib/dictionary";
import {
  SettingsSectionNav,
  type SettingsSectionNavItem,
} from "./settings-section-nav";

const INVENTORY_SETTINGS_PERMISSIONS = [
  PERMISSION_KEYS.SETTINGS_BRANCH,
  PERMISSION_KEYS.SETTINGS_TENANT,
  PERMISSION_KEYS.SETTINGS_INTEGRATIONS,
] as const;

export default async function InventorySettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
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

  const canManageQc =
    canManageTenantSettings && SUPPLIER_RETURN_ROLES.includes(claims.user_role);
  const sectionItems: SettingsSectionNavItem[] = [];

  if (canManageCatalog) {
    sectionItems.push({
      href: "/inventory/settings/categories",
      label: tRoute("/inventory/settings/categories", "tab"),
      icon: "categories",
    });
  }

  if (canManageUnits) {
    sectionItems.push({
      href: "/inventory/settings/units",
      label: tRoute("/inventory/settings/units", "tab"),
      icon: "units",
    });
  }

  if (canManageCatalog) {
    sectionItems.push({
      href: "/inventory/settings/thresholds",
      label: tRoute("/inventory/settings/thresholds", "tab"),
      icon: "thresholds",
    });
  }

  if (canManageQc) {
    sectionItems.push({
      href: "/inventory/settings/qc",
      label: tRoute("/inventory/settings/qc", "tab"),
      icon: "qc",
    });
  }

  return (
    <AppPage width="xwide" density="compact">
      <SettingsSectionNav items={sectionItems} />
      {children}
    </AppPage>
  );
}
