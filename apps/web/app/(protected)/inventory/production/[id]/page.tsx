/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
import { notFound } from "next/navigation";
import {
  fetchProductionRunById,
} from "../../production-run-actions";
import { ProductionDetailClient } from "./production-detail-client";
import {
  AppBackLink,
  AppPage,
  AppPageHeader,
} from "@/components/surface";
import { getStatusBadgeMeta } from "@/components/status-badge";

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
  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
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
      <ProductionDetailClient run={run} />
    </AppPage>
  );
}
