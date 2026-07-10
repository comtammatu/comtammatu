import { notFound, redirect } from "next/navigation";
import { BranchStocktakeDetailClient } from "./branch-stocktake-detail-client";
import { loadBranchStocktakeDetailData } from "@lib/inventory/branch-stocktake-data";

interface PageProps {
  params: Promise<{ branchId: string; id: string }>;
  searchParams: Promise<{ error?: string; view?: string }>;
}

export default async function OperatorStocktakeDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { branchId: rawBranchId, id: rawId } = await params;
  const branchId = Number(rawBranchId);
  const stocktakeId = Number(rawId);
  if (
    !Number.isInteger(branchId) ||
    branchId <= 0 ||
    !Number.isInteger(stocktakeId) ||
    stocktakeId <= 0
  ) {
    notFound();
  }

  const data = await loadBranchStocktakeDetailData(stocktakeId, branchId);
  const query = await searchParams;
  const countUnavailable =
    query.error === "stocktake_redesigned_not_enabled";
  const isReviewView = query.view === "detail" || countUnavailable;
  if (data.session.status === "in_progress" && !isReviewView) {
    redirect(`/br/${branchId}/stock/stocktake/${stocktakeId}/count`);
  }

  return (
    <BranchStocktakeDetailClient
      data={data}
      stockBasePath={`/br/${branchId}/stock`}
      countUnavailable={countUnavailable}
    />
  );
}
