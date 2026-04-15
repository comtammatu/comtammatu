import { fetchSuppliers } from "@/inventory/procurement-actions";
import {
  SuppliersClient,
  type SupplierRow,
} from "@/inventory/suppliers/suppliers-client";
import { Card, CardHeader, CardTitle } from "@comtammatu/ui/components/card";
import { tRoute } from "../../_lib/dictionary";

export default async function SuppliersSettingsPage() {
  const res = await fetchSuppliers();
  const rows: SupplierRow[] = res.success
    ? ((res.data ?? []) as SupplierRow[])
    : [];

  return (
    <div className="space-y-6">
      <Card className="border-border/70">
        <CardHeader>
          <CardTitle className="text-2xl">
            {tRoute("/inventory/settings/suppliers", "heading")}
          </CardTitle>
        </CardHeader>
      </Card>
      <SuppliersClient initial={rows} />
    </div>
  );
}
