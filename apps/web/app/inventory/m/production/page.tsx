import { loadProductionSurfaceData } from "../../production-data";
import { MobileProductionClient } from "./mobile-production-client";

export default async function MobileProductionPage() {
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
    <MobileProductionClient
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
