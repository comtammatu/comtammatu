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
  canManageRecipes: boolean;
  canCreateProduction: boolean;
  canConfirmProduction: boolean;
  centralKitchenBranches: BranchOption[];
  ingredients: IngredientOption[];
  finishedGoods: FinishedGoodOption[];
  orders: ProductionOrderRow[];
  recipes: ProductionRecipeRow[];
}

export function ProductionHubClient({
  canManageCatalog,
  canManageRecipes,
  canCreateProduction,
  canConfirmProduction,
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
        canManageRecipes={canManageRecipes}
      />

      <div className="flex flex-wrap items-center justify-end gap-3">
        <ProductionOrderForm
          centralKitchenBranches={centralKitchenBranches}
          finishedGoodsOptions={sortedFinishedGoods}
          actionsEnabled={actionsEnabled && canCreateProduction}
        />
      </div>

      <ProductionOrderList
        orders={orders}
        canConfirmProduction={canConfirmProduction}
      />

      <ProductionRecipePanel
        canManageCatalog={canManageCatalog}
        canManageRecipes={canManageRecipes}
        finishedGoods={finishedGoods}
        ingredients={ingredients}
        recipes={recipes}
      />
    </div>
  );
}
