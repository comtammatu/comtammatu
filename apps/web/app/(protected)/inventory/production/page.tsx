import { loadProductionSurfaceData } from "../production-data";
import { ProductionHubClient } from "../production-client";

export default async function ProductionPage() {
  const {
    canManageCatalog,
    canManageRecipes,
    canCreateProduction,
    canConfirmProduction,
    canAdjustStock,
    productionBranches,
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
      canAdjustStock={canAdjustStock}
      productionBranches={productionBranches}
      ingredients={ingredients}
      finishedGoods={finishedGoods}
      orders={orders}
      recipes={recipes}
    />
  );
}
