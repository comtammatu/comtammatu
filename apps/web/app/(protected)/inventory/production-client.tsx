"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft as IconArrowLeft,
  ClipboardList as IconClipboardList,
  FlaskConical as IconFlaskConical,
  Package as IconPackage,
} from "lucide-react";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import {
  AppLinkCard,
  AppPage,
  AppPageHeader,
  LinkCardGrid,
} from "@/components/surface";
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

const PRODUCTION_ORDERS_VIEW = "orders";
const PRODUCTION_RECIPES_VIEW = "recipes";

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
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get("view");

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

  const draftOrderCount = useMemo(
    () => orders.filter((order) => order.status === "draft").length,
    [orders],
  );
  const finishedGoodCount = finishedGoods.length;

  const buildViewHref = useCallback(
    (nextView: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (nextView == null) {
        next.delete("view");
      } else {
        next.set("view", nextView);
      }
      const query = next.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [pathname, searchParams],
  );

  const handleOpenRecipes = useCallback(() => {
    router.push(buildViewHref(PRODUCTION_RECIPES_VIEW));
  }, [buildViewHref, router]);

  const createAction = (
    <ProductionOrderForm
      productionBranches={productionBranches}
      finishedGoodsOptions={sortedFinishedGoods}
      actionsEnabled={actionsEnabled && canCreateProduction}
    />
  );

  const backToHub = (
    <Button variant="outline" size="sm" asChild>
      <Link href={buildViewHref(null)}>
        <IconArrowLeft data-icon="inline-start" />
        {INVENTORY_VI.productionBackToHub}
      </Link>
    </Button>
  );

  let body: React.ReactNode;
  if (view === PRODUCTION_ORDERS_VIEW) {
    body = (
      <>
        <div className="flex items-center justify-between gap-3">
          {backToHub}
          {createAction}
        </div>
        <ProductionOrderList
          orders={orders}
          canConfirmProduction={canConfirmProduction}
          canAdjustStock={canAdjustStock}
        />
      </>
    );
  } else if (view === PRODUCTION_RECIPES_VIEW) {
    body = (
      <>
        <div className="flex items-center justify-between gap-3">
          {backToHub}
        </div>
        <ProductionRecipePanel
          canManageCatalog={canManageCatalog}
          canManageRecipes={canManageRecipes}
          finishedGoods={finishedGoods}
          ingredients={ingredients}
          recipes={recipes}
        />
      </>
    );
  } else {
    body = (
      <>
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
          onOpenRecipes={handleOpenRecipes}
        />
        <LinkCardGrid>
          <AppLinkCard
            href={buildViewHref(PRODUCTION_ORDERS_VIEW)}
            title={INVENTORY_VI.productionOrdersTab}
            description={INVENTORY_VI.productionOrdersCardDescription}
            icon={<IconClipboardList />}
            tone="primary"
            badge={INVENTORY_VI.productionDraftBadge(draftOrderCount)}
            badgeVariant={draftOrderCount > 0 ? "warning" : "secondary"}
            metric={{
              value: orders.length,
              label: INVENTORY_VI.productionOrdersMetricLabel,
            }}
            ctaLabel={INVENTORY_VI.productionOpenOrders}
          />
          <AppLinkCard
            href={buildViewHref(PRODUCTION_RECIPES_VIEW)}
            title={INVENTORY_VI.productionRecipesTab}
            description={INVENTORY_VI.productionRecipesCardDescription}
            icon={<IconFlaskConical />}
            tone="info"
            metric={{
              value: recipeFinishedGoodCount,
              label: INVENTORY_VI.productionRecipesMetricLabel,
            }}
            ctaLabel={INVENTORY_VI.productionOpenRecipes}
          />
          <AppLinkCard
            href="/inventory/ingredients"
            title={INVENTORY_VI.productionCatalogCardTitle}
            description={INVENTORY_VI.productionCatalogCardDescription}
            icon={<IconPackage />}
            tone="secondary"
            metric={{
              value: finishedGoodCount + rawMaterialCount,
              label: INVENTORY_VI.productionCatalogMetricLabel,
            }}
            ctaLabel={INVENTORY_VI.productionOpenCatalog}
          />
        </LinkCardGrid>
      </>
    );
  }

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
      {body}
    </>
  );

  if (embedded) {
    return <div className="flex w-full flex-col gap-3">{content}</div>;
  }

  return <AppPage width="wide">{content}</AppPage>;
}
