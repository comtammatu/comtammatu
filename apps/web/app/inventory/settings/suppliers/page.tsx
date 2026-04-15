import { fetchSuppliers } from "@/inventory/procurement-actions";
import {
  SuppliersClient,
  type SupplierRow,
} from "@/inventory/suppliers/suppliers-client";
import { PageHeader } from "../../_components/shared";
import { tRoute } from "../../_lib/dictionary";

export default async function SuppliersSettingsPage() {
  const res = await fetchSuppliers();
  const rows: SupplierRow[] = res.success
    ? ((res.data ?? []) as SupplierRow[])
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={tRoute("/inventory/settings/suppliers", "heading")}
      />
      <SuppliersClient initial={rows} />
    </div>
  );
}
