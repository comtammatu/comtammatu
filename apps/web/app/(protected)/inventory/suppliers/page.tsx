import { fetchSuppliers } from "../procurement-actions";
import { SuppliersClient } from "./suppliers-client";
import type { SupplierRow } from "./supplier-dialog";

export default async function SuppliersPage() {
  const result = await fetchSuppliers();
  if (!result.success) {
    throw new Error("inventory.suppliers.load_failed");
  }

  const initial = result.data as SupplierRow[];

  return <SuppliersClient initial={initial} />;
}
