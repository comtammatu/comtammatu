import { notFound } from "next/navigation";
import { loadStockIngredientDetailData } from "@lib/inventory/stock-on-hand-detail-data";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";
import { BranchStockIngredientDetail } from "./branch-stock-ingredient-detail";

interface PageProps {
  params: Promise<{ branchId: string; ingredientId: string }>;
}

export default async function OperatorStockIngredientDetailPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId, ingredientId: rawIngredientId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  const ingredientId = Number(rawIngredientId);
  if (
    branchId == null ||
    !Number.isInteger(ingredientId) ||
    ingredientId <= 0
  ) {
    notFound();
  }

  const stockBasePath = `/br/${branchId}/stock`;
  const data = await loadStockIngredientDetailData({
    ingredientId,
    routeBranchId: branchId,
    includeValuation: false,
    movementLimit: 12,
  });

  return (
    <BranchStockIngredientDetail data={data} stockBasePath={stockBasePath} />
  );
}
