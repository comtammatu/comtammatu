import { InventoryHeader } from "../_components/inventory-header";
import { loadProductionSurfaceData } from "../production-data";
import { ProductionHubClient } from "../production-client";

export default async function ProductionPage() {
  const {
    canManageCatalog,
    canManageRecipes,
    canCreateProduction,
    canConfirmProduction,
    centralKitchenBranches,
    ingredients,
    finishedGoods,
    orders,
    recipes,
  } = await loadProductionSurfaceData();

  return (
    <>
      <InventoryHeader title="Bếp trung tâm" />
      <div className="flex-1 overflow-auto p-4">
        <div className="mx-auto max-w-7xl space-y-6">
          <ProductionHubClient
            canManageCatalog={canManageCatalog}
            canManageRecipes={canManageRecipes}
            canCreateProduction={canCreateProduction}
            canConfirmProduction={canConfirmProduction}
            centralKitchenBranches={centralKitchenBranches}
            ingredients={ingredients}
            finishedGoods={finishedGoods}
            orders={orders}
            recipes={recipes}
          />
        </div>
      </div>
    </>
  );
}
