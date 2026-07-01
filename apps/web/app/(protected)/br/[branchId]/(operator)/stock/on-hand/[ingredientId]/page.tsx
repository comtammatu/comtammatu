import { notFound } from "next/navigation";
import { StockIngredientDetailPageContent } from "@/(protected)/inventory/stock/[ingredientId]/page";

interface PageProps {
  params: Promise<{ branchId: string; ingredientId: string }>;
}

export default async function OperatorStockIngredientDetailPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId, ingredientId: rawIngredientId } = await params;
  const branchId = Number(rawBranchId);
  const ingredientId = Number(rawIngredientId);
  if (
    !Number.isInteger(branchId) ||
    branchId <= 0 ||
    !Number.isInteger(ingredientId) ||
    ingredientId <= 0
  ) {
    notFound();
  }

  return (
    <StockIngredientDetailPageContent
      ingredientId={ingredientId}
      routeBranchId={branchId}
      branchStockBasePath={`/br/${branchId}/stock`}
      embedded
    />
  );
}
