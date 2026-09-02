import { PERMISSION_KEYS } from "@comtammatu/shared/auth";

export const CATALOG_MANAGE_PERMISSIONS = [
  PERMISSION_KEYS.INVENTORY_CATALOG_WRITE,
] as const;

/** Browse `/inventory/ingredients` without catalog write rights. */
export const CATALOG_READ_PERMISSIONS = [
  PERMISSION_KEYS.INVENTORY_READ,
] as const;

/** Units master screen (/inventory/settings/units): dedicated permission only. */
export const UNITS_MASTER_PERMISSIONS = [
  PERMISSION_KEYS.INVENTORY_UNITS_MASTER,
] as const;
