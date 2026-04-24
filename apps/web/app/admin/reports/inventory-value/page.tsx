import { Card, CardContent } from "@comtammatu/ui/components/card";
import { getInventoryValueVisibility } from "@comtammatu/shared/auth";
import { APP_COPY_VI } from "@comtammatu/shared/labels";
import { loadAuthState } from "@/_lib/auth";
import { InventoryValuePanel } from "@/inventory/inventory-value-panel";

export default async function InventoryValueReportPage() {
  const { claims } = await loadAuthState();
  const inventoryValueVisibility = getInventoryValueVisibility(claims.user_role);

  return (
    <div className="space-y-5 lg:space-y-6">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <div className="space-y-3">
            <span className="inline-flex items-center rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {APP_COPY_VI.executiveReporting}
            </span>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                Giá trị tồn kho
              </h2>
            </div>
          </div>
        </CardContent>
      </Card>
      <InventoryValuePanel visibility={inventoryValueVisibility} />
    </div>
  );
}
