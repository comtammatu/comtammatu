import { loadProductionSurfaceData } from "../../production-data";
import { MobileProductionClient } from "./mobile-production-client";

export default async function MobileProductionPage() {
  const {
    canManageCatalog,
    centralKitchenBranches,
    ingredients,
    finishedGoods,
    orders,
    recipes,
  } = await loadProductionSurfaceData();

  return (
    <MobileProductionClient
      canManageCatalog={canManageCatalog}
      centralKitchenBranches={centralKitchenBranches}
      ingredients={ingredients}
      finishedGoods={finishedGoods}
      orders={orders}
      recipes={recipes}
    />
  );
}
