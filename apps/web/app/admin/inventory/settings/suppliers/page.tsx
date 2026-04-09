import { fetchSuppliers } from "../../procurement-actions";
import {
  SuppliersClient,
  type SupplierRow,
} from "../../suppliers/suppliers-client";
import { PageHeader } from "@/components/foundation/ui-patterns";

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
