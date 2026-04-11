import { fetchSuppliers } from "@/admin/inventory/procurement-actions";
import {
  SuppliersClient,
  type SupplierRow,
} from "@/admin/inventory/suppliers/suppliers-client";
import { PageHeader } from "../../_components/shared";

export default async function SuppliersSettingsPage() {
  const res = await fetchSuppliers();
  const rows: SupplierRow[] = res.success
    ? ((res.data ?? []) as SupplierRow[])
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nhà cung cấp"
        description="Quản lý danh sách nhà cung cấp"
      />
      <SuppliersClient initial={rows} />
    </div>
  );
}
