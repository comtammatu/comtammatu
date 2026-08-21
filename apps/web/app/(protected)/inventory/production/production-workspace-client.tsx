"use client";

import { useState } from "react";
import { Plus as IconPlus } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { AppPageHeader } from "@/components/surface";
import { AppPageTabs, TabsContent } from "@/components/app-page-tabs";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { useDocumentOverlayUrl } from "@lib/navigation/use-document-overlay-url";
import dynamic from "next/dynamic";
import { ProductionRunsClient } from "./production-runs-client";
import { ProductionDocumentDialogHost } from "./production-document-dialog-host";

const ProductionCreateDialog = dynamic(
  () =>
    import("./production-create-dialog").then(
      (mod) => mod.ProductionCreateDialog,
    ),
  { ssr: false },
);

const ProductionRecipePanel = dynamic(
  () =>
    import("../production-recipe-panel").then(
      (mod) => mod.ProductionRecipePanel,
    ),
  { ssr: false },
);
import type { ProductionRunListRow } from "../production-run-actions";
import type {
  BranchOption,
  FinishedGoodOption,
  IngredientOption,
  InventoryLocationOption,
  ProductionRecipeRow,
} from "../production-types";
import type { UnitOption } from "@lib/inventory/types";

const TAB_QUERY_KEYS = {
  runs: ["branch", "runId", "mode", "q", "status"],
  recipes: ["branch", "recipeSpecId"],
} as const;

export function ProductionWorkspaceClient({
  activeTab,
  canCreateProduction,
  canManageRecipes,
  canManageCatalog,
  runs,
  recipes,
  recipeLoadError,
  finishedGoods,
  unitOptions,
  ingredients,
  productionBranches,
  locations,
  selectedBranchId,
}: {
  activeTab: "runs" | "recipes";
  canCreateProduction: boolean;
  canManageRecipes: boolean;
  canManageCatalog: boolean;
  runs: ProductionRunListRow[];
  recipes: ProductionRecipeRow[];
  recipeLoadError: string | null;
  finishedGoods: FinishedGoodOption[];
  unitOptions: UnitOption[];
  ingredients: IngredientOption[];
  productionBranches: BranchOption[];
  locations: InventoryLocationOption[];
  selectedBranchId?: number;
}) {
  const overlay = useDocumentOverlayUrl(["runId", "mode"]);
  const [createRunOpen, setCreateRunOpen] = useState(false);
  const [createRecipeOpen, setCreateRecipeOpen] = useState(false);

  return (
    <>
      <AppPageHeader
        title={INVENTORY_VI.productionTitle}
        actions={
          activeTab === "runs" && canCreateProduction ? (
            <Button size="lg" type="button" onClick={() => setCreateRunOpen(true)}>
              <IconPlus data-icon="inline-start" />
              {INVENTORY_VI.createOrderShort}
            </Button>
          ) : activeTab === "recipes" && canManageRecipes ? (
            <Button
              size="lg"
              type="button"
              onClick={() => setCreateRecipeOpen(true)}
            >
              <IconPlus data-icon="inline-start" />
              {INVENTORY_VI.productionRecipeCreate}
            </Button>
          ) : null
        }
      />
      <AppPageTabs
        items={[
          { value: "runs", label: INVENTORY_VI.productionOrdersTab },
          { value: "recipes", label: INVENTORY_VI.productionRecipesTab },
        ]}
        defaultValue={activeTab}
        queryKeysByValue={TAB_QUERY_KEYS}
      >
        <TabsContent value="runs" className="mt-0">
          <ProductionRunsClient initial={runs} />
        </TabsContent>
        <TabsContent value="recipes" className="mt-0">
          <ProductionRecipePanel
            canManageCatalog={canManageCatalog}
            canManageRecipes={canManageRecipes}
            finishedGoods={finishedGoods}
            unitOptions={unitOptions}
            ingredients={ingredients}
            recipes={recipes}
            recipeLoadError={recipeLoadError}
            createOpen={createRecipeOpen}
            onCreateOpenChange={setCreateRecipeOpen}
          />
        </TabsContent>
      </AppPageTabs>
      <ProductionCreateDialog
        open={createRunOpen}
        onOpenChange={setCreateRunOpen}
        branches={productionBranches}
        locations={locations}
        finishedGoods={finishedGoods.filter(
          (good) => good.recipeStatus === "active" && good.recipeSpecId != null,
        )}
        initialBranchId={selectedBranchId}
        onCreated={(runId) => {
          overlay.patchOverlay({ runId, mode: "view" }, "push");
        }}
      />
      <ProductionDocumentDialogHost />
    </>
  );
}
