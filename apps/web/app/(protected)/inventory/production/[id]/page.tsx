/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
import { notFound } from "next/navigation";
import { fetchProductionRunById } from "../../production-run-actions";
import { ProductionDetailClient } from "./production-detail-client";
import { AppPage, AppPageHeader } from "@/components/surface";
import { StatusBadge } from "@/components/status-badge";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default async function ProductionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const runId = parseInt(id, 10);
  if (isNaN(runId)) notFound();

  const res = await fetchProductionRunById(runId);
  if (!res.success || !res.data) {
    notFound();
  }

  const run = res.data;

  return (
    <AppPage width="narrow" density="compact">
      <AppPageHeader 
        title={`Lệnh sản xuất ${run.production_number}`} 
        actions={<StatusBadge domain="inventory" value={run.status} />}
        breadcrumb={
            <Link
              href="/inventory/production"
              className="text-muted-foreground hover:text-foreground text-sm flex items-center mb-2"
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Quay lại
            </Link>
        }
      />
      <ProductionDetailClient run={run} />
    </AppPage>
  );
}
