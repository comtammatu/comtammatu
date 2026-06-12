"use client";

import { useMemo } from "react";
import { AppPage, AppPageHeader } from "@/components/surface";
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
  canAdjustStock: boolean;
  productionBranches: BranchOption[];
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
  canAdjustStock,
  productionBranches,
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
        productionBranches,
        ingredients,
        finishedGoods,
        recipes,
      }),
    [productionBranches, finishedGoods, ingredients, recipes],
  );
  const rawMaterialCount = useMemo(
    () =>
      ingredients.filter(
        (ingredient) => ingredient.item_kind === "raw_material",
      ).length,
    [ingredients],
  );
  const recipeFinishedGoodCount = useMemo(
    () => new Set(recipes.map((recipe) => recipe.finished_good_id)).size,
    [recipes],
  );

  return (
    <AppPage>
      <AppPageHeader
        eyebrow="Kho hàng"
        title="Sản xuất chi nhánh"
        description="Lệnh sản xuất và BOM thành phẩm theo chi nhánh"
        actions={
          <ProductionOrderForm
            productionBranches={productionBranches}
            finishedGoodsOptions={sortedFinishedGoods}
            actionsEnabled={actionsEnabled && canCreateProduction}
          />
        }
      />
      <ProductionStats
        orders={orders}
        readinessMessage={readinessMessage}
        readinessState={readinessState}
        productionBranchCount={productionBranches.length}
        finishedGoodCount={finishedGoods.length}
        rawMaterialCount={rawMaterialCount}
        recipeFinishedGoodCount={recipeFinishedGoodCount}
        recipeLineCount={recipes.length}
        canManageCatalog={canManageCatalog}
        canManageRecipes={canManageRecipes}
      />

      <ProductionOrderList
        orders={orders}
        canConfirmProduction={canConfirmProduction}
        canAdjustStock={canAdjustStock}
      />

      <ProductionRecipePanel
        canManageCatalog={canManageCatalog}
        canManageRecipes={canManageRecipes}
        finishedGoods={finishedGoods}
        ingredients={ingredients}
        recipes={recipes}
      />
    </AppPage>
  );
}
