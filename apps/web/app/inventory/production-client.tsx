"use client";

import { useMemo } from "react";
import { ProductionStats } from "./production-stats";
import { ProductionOrderList } from "./production-order-list";
import { ProductionOrderForm } from "./production-order-form";
import { ProductionRecipePanel } from "./production-recipe-panel";
import { getProductionReadinessSummary } from "./production-types";
import type {
  BranchOption,
  FinishedGoodOption,
  IngredientOption,
  ProductionOrderRow,
  ProductionRecipeRow,
} from "./production-types";

interface ProductionHubClientProps {
  canManageCatalog: boolean;
  centralKitchenBranches: BranchOption[];
  ingredients: IngredientOption[];
  finishedGoods: FinishedGoodOption[];
  orders: ProductionOrderRow[];
  recipes: ProductionRecipeRow[];
}

export function ProductionHubClient({
  canManageCatalog,
  centralKitchenBranches,
  ingredients,
  finishedGoods,
  orders,
  recipes,
}: ProductionHubClientProps) {
  const {
    sortedFinishedGoods,
    readinessState,
    readinessMessage,
    actionsEnabled,
  } = useMemo(
    () =>
      getProductionReadinessSummary({
        centralKitchenBranches,
        ingredients,
        finishedGoods,
        recipes,
      }),
    [centralKitchenBranches, finishedGoods, ingredients, recipes],
  );

  return (
    <div className="space-y-6">
      <ProductionStats
        orders={orders}
        readinessMessage={readinessMessage}
        readinessState={readinessState}
        centralKitchenCount={centralKitchenBranches.length}
        canManageCatalog={canManageCatalog}
      />

      <div className="flex flex-wrap items-center justify-end gap-3">
        <ProductionOrderForm
          centralKitchenBranches={centralKitchenBranches}
          finishedGoodsOptions={sortedFinishedGoods}
          actionsEnabled={actionsEnabled}
        />
      </div>

      <ProductionOrderList orders={orders} />

      <ProductionRecipePanel
        canManageCatalog={canManageCatalog}
        finishedGoods={finishedGoods}
        ingredients={ingredients}
        recipes={recipes}
      />
    </div>
  );
}
