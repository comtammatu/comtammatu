/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { StatusBadge } from "@/components/status-badge";
import {
  fetchProductionRecipeContext,
  fetchProductionRunById,
} from "@/(protected)/inventory/production-run-actions";
import { ProductionDetailClient } from "@/(protected)/inventory/production/[id]/production-detail-client";

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
  if (run.branch_id !== branchId && run.target_branch_id !== branchId) notFound();

  const recipeRes = await fetchProductionRecipeContext(
    run.finished_good_id,
    run.branch_id,
  );
  const recipeContext = recipeRes.success && recipeRes.data ? recipeRes.data : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="touch" className="px-2">
          <Link href={`/br/${branchId}/stock/production`}>
            <IconArrowLeft data-icon="inline-start" />
            Quay lại
          </Link>
        </Button>
        <StatusBadge domain="inventory" value={run.status} />
      </div>
      <ProductionDetailClient run={run} recipeContext={recipeContext} />
    </div>
  );
}
