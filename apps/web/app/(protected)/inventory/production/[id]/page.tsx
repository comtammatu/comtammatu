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
  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        title={
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{run.production_number}</span>
            <StatusBadge domain="inventory" value={run.status} />
          </div>
        }
        meta={run.finished_good_name}
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
