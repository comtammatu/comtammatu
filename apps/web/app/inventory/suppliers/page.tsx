import { fetchSuppliers } from "../procurement-actions";
import { SuppliersClient } from "./suppliers-client";
import type { SupplierItem } from "./suppliers-client";

export default async function SuppliersPage() {
  const result = await fetchSuppliers();

  const dbRows = result.success
    ? (result.data as Array<{
        id: number;
        name: string;
        tax_code: string | null;
        phone: string | null;
        address: string | null;
        is_active: boolean;
      }>)
    : [];

  const suppliers: SupplierItem[] = dbRows.map((row, idx) => ({
    id: row.id,
    name: row.name,
    code: `NCC-${String(idx + 1).padStart(3, "0")}`,
    taxId: row.tax_code ?? "",
    phone: row.phone ?? "",
    address: row.address ?? "",
    category: "",
    status: row.is_active ? "active" : "suspended",
  }));

  return <SuppliersClient suppliers={suppliers} />;
}
