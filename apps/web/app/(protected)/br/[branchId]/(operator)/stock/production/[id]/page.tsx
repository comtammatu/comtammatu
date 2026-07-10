import { notFound } from "next/navigation";
import {
  fetchProductionRecipeContext,
  fetchProductionRunById,
} from "@/(protected)/inventory/production-run-actions";
import { BranchProductionDetailClient } from "./branch-production-detail-client";

interface PageProps {
  params: Promise<{ branchId: string; id: string }>;
}

export default async function OperatorProductionDetailPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId, id: rawId } = await params;
  const branchId = Number(rawBranchId);
  const runId = Number(rawId);
  if (
    !Number.isInteger(branchId) ||
    branchId <= 0 ||
    !Number.isInteger(runId) ||
    runId <= 0
  ) {
    notFound();
  }

  const res = await fetchProductionRunById(runId);
  if (!res.success || !res.data) notFound();

  const run = res.data;
  if (run.branch_id !== branchId && run.target_branch_id !== branchId)
    notFound();

  const recipeRes = await fetchProductionRecipeContext(
    run.finished_good_id,
    run.branch_id,
    run.source_location_id ?? undefined,
  );
  const recipeContext =
    recipeRes.success && recipeRes.data ? recipeRes.data : null;
  const recipeContextError = recipeRes.success
    ? null
    : (recipeRes.error ?? "Không thể kiểm tra định mức và tồn kho.");

  return (
    <BranchProductionDetailClient
      run={run}
      recipeContext={recipeContext}
      recipeContextError={recipeContextError}
      basePath={`/br/${branchId}/stock/production`}
    />
  );
}
