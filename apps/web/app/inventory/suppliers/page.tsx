import { fetchSuppliers } from "../procurement-actions";
import { SuppliersClient } from "./suppliers-client";
import type { SupplierRow } from "./supplier-dialog";

export default async function SuppliersPage() {
  const result = await fetchSuppliers();

  const initial: SupplierRow[] = result.success
    ? (result.data as SupplierRow[])
    : [];

  return <SuppliersClient initial={initial} />;
}
