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
  );
}
