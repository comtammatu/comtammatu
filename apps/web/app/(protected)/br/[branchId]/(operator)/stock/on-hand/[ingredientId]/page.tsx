import { notFound } from "next/navigation";
import { getSafeInternalReturnTo } from "@comtammatu/shared/auth";
import { loadStockIngredientDetailData } from "@lib/inventory/stock-on-hand-detail-data";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";
import { BranchStockIngredientDetail } from "./branch-stock-ingredient-detail";

interface PageProps {
  params: Promise<{ branchId: string; ingredientId: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}

export default async function OperatorStockIngredientDetailPage({
  params,
  searchParams,
}: PageProps) {
  const [routeParams, query] = await Promise.all([params, searchParams]);
  const { branchId: rawBranchId, ingredientId: rawIngredientId } = routeParams;
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
  const rawReturnTo = Array.isArray(query.returnTo)
    ? query.returnTo[0]
    : query.returnTo;
  const safeReturnTo = getSafeInternalReturnTo(rawReturnTo);
  const backHref =
    safeReturnTo === stockBasePath ||
    safeReturnTo?.startsWith(`${stockBasePath}?`)
      ? safeReturnTo
      : stockBasePath;
  const data = await loadStockIngredientDetailData({
    ingredientId,
    routeBranchId: branchId,
    includeValuation: false,
    movementLimit: 12,
  });

  return (
    <BranchStockIngredientDetail
      data={data}
      stockBasePath={stockBasePath}
      backHref={backHref}
    />
  );
}
