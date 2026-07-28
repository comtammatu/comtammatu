/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
import { notFound } from "next/navigation";
import {
  fetchProductionRunById,
  fetchProductionRecipeContext,
} from "../../production-run-actions";
import { ProductionDetailClient } from "./production-detail-client";
import {
  AppBackLink,
  AppPage,
  AppPageHeader,
} from "@/components/surface";
import { getStatusBadgeMeta } from "@/components/status-badge";
import { INVENTORY_VI } from "@comtammatu/shared/messages";

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
  const statusBadge = getStatusBadgeMeta("inventory", run.status);
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
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        eyebrow={INVENTORY_VI.warehouse}
        title={`Lệnh sản xuất ${run.production_number}`}
        badge={{
          children: statusBadge.label,
          variant: statusBadge.variant,
        }}
        breadcrumb={
          <AppBackLink href="/inventory/production">
            Quay lại
          </AppBackLink>
        }
      />
      <ProductionDetailClient
        run={run}
        recipeContext={recipeContext}
        recipeContextError={recipeContextError}
      />
    </AppPage>
  );
}
