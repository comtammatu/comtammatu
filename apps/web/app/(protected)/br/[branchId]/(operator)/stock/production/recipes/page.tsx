import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { loadProductionSurfaceData } from "@/(protected)/inventory/production-data";
import { ProductionRecipePanel } from "@/(protected)/inventory/production-recipe-panel";

export default async function OperatorProductionRecipesPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const data = await loadProductionSurfaceData({ routeBranchId: branchId });
  if (!data.canManageRecipes) notFound();

  return (
    <>
      <Link
        href={`/br/${branchId}/stock/production`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <IconArrowLeft className="size-4" />
        {INVENTORY_VI.productionBackToHub}
      </Link>
      <ProductionRecipePanel
        canManageCatalog={data.canManageCatalog}
        canManageRecipes={data.canManageRecipes}
        finishedGoods={data.finishedGoods}
        unitOptions={data.unitOptions}
        ingredients={data.ingredients}
        recipes={data.recipes}
      />
    </>
  );
}
