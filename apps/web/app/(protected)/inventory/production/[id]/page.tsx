/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { fetchProductionRunById, fetchProductionRecipeContext } from "../../production-run-actions";
import { ProductionDetailClient } from "./production-detail-client";
import { AppPage, AppPageHeader } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";

export default async function ProductionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const runId = Number.parseInt(id, 10);
  if (Number.isNaN(runId)) notFound();

  const res = await fetchProductionRunById(runId);
  if (!res.success || !res.data) {
    notFound();
  }

  const run = res.data;
  const recipeRes = await fetchProductionRecipeContext(run.finished_good_id, run.branch_id);
  const recipeContext = recipeRes.success && recipeRes.data ? recipeRes.data : null;

  return (
    <AppPage width="wide" density="compact">
      <AppPageHeader 
        title={`Lệnh sản xuất ${run.production_number}`} 
        actions={<StatusBadge domain="inventory" value={run.status} />}
        breadcrumb={
          <Button asChild variant="ghost" size="sm" className="px-2">
            <Link
              href="/inventory/production"
            >
              <IconArrowLeft data-icon="inline-start" />
              Quay lại
            </Link>
          </Button>
        }
      />
      <ProductionDetailClient run={run} recipeContext={recipeContext} />
    </AppPage>
  );
}
