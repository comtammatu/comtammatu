import { fetchSuppliers } from "../procurement-actions";
import { SuppliersClient, type SupplierRow } from "./suppliers-client";

export default async function SuppliersPage() {
  const res = await fetchSuppliers();
  const rows: SupplierRow[] = res.success
    ? ((res.data ?? []) as SupplierRow[])
    : [];

  return <SuppliersClient initial={rows} />;
}
