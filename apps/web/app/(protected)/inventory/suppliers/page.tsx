import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { currentUserHasPermissionAny } from "@/_lib/permissions";
import { fetchSuppliers } from "../procurement-actions";
import { SuppliersClient } from "./suppliers-client";
import type { SupplierRow } from "./supplier-dialog";

export default async function SuppliersPage() {
  const [result, canManageItems] = await Promise.all([
    fetchSuppliers(),
    currentUserHasPermissionAny(PERMISSION_KEYS.PROCUREMENT_PRICE_LIST_WRITE),
  ]);
  if (!result.success) {
    throw new Error("inventory.suppliers.load_failed");
  }

  const initial = result.data as SupplierRow[];

  return <SuppliersClient initial={initial} canManageItems={canManageItems} />;
}
