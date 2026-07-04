import { notFound } from "next/navigation";
import { loadProductionSurfaceData } from "@/(protected)/inventory/production-data";
import { ProductionOperatorClient } from "./production-operator-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorProductionPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  const {
    canCreateProduction,
    canConfirmProduction,
    productionBranches,
    ingredients,
    finishedGoods,
    orders,
    recipes,
  } = await loadProductionSurfaceData({ routeBranchId: branchId });

  return (
    <ProductionOperatorClient
      productionBranches={productionBranches}
      ingredients={ingredients}
      finishedGoods={finishedGoods}
      orders={orders}
      recipes={recipes}
      canCreateProduction={canCreateProduction}
      canConfirmProduction={canConfirmProduction}
    />
  );
}
