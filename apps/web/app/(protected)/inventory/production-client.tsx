"use client";

import { useCallback, useMemo, useState } from "react";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
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

const PRODUCTION_ORDERS_TAB = "orders";
const PRODUCTION_RECIPES_TAB = "recipes";

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
  embedded?: boolean;
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
  embedded = false,
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

  const [activeTab, setActiveTab] = useState<string>(PRODUCTION_ORDERS_TAB);
  const handleOpenRecipesTab = useCallback(() => {
    setActiveTab(PRODUCTION_RECIPES_TAB);
  }, []);

  const createAction = (
    <ProductionOrderForm
      productionBranches={productionBranches}
      finishedGoodsOptions={sortedFinishedGoods}
      actionsEnabled={actionsEnabled && canCreateProduction}
    />
  );

  const content = (
    <>
      {embedded ? (
        <div className="flex justify-end">{createAction}</div>
      ) : (
        <AppPageHeader
          eyebrow={INVENTORY_VI.warehouse}
          title={INVENTORY_VI.productionTitle}
          description={INVENTORY_VI.productionDescription}
          actions={createAction}
        />
      )}
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
        onOpenRecipes={handleOpenRecipesTab}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value={PRODUCTION_ORDERS_TAB}>
            {INVENTORY_VI.productionOrdersTab}
          </TabsTrigger>
          <TabsTrigger value={PRODUCTION_RECIPES_TAB}>
            {INVENTORY_VI.productionRecipesTab}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={PRODUCTION_ORDERS_TAB}>
          <ProductionOrderList
            orders={orders}
            canConfirmProduction={canConfirmProduction}
            canAdjustStock={canAdjustStock}
          />
        </TabsContent>

        <TabsContent value={PRODUCTION_RECIPES_TAB}>
          <ProductionRecipePanel
            canManageCatalog={canManageCatalog}
            canManageRecipes={canManageRecipes}
            finishedGoods={finishedGoods}
            ingredients={ingredients}
            recipes={recipes}
          />
        </TabsContent>
      </Tabs>
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return <AppPage>{content}</AppPage>;
}
