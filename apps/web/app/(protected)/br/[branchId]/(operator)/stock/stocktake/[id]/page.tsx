import { notFound, redirect } from "next/navigation";
import { BranchStocktakeDetailClient } from "./branch-stocktake-detail-client";
import { loadBranchStocktakeDetailData } from "@lib/inventory/branch-stocktake-data";

interface PageProps {
  params: Promise<{ branchId: string; id: string }>;
  searchParams: Promise<{ view?: string }>;
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
  const isReviewView = query.view === "detail";
  if (data.session.status === "in_progress" && !isReviewView) {
    redirect(`/br/${branchId}/stock/stocktake/${stocktakeId}/count`);
  }

  return (
    <BranchStocktakeDetailClient
      data={data}
      stockBasePath={`/br/${branchId}/stock`}
    />
  );
}
