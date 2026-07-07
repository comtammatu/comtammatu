/* eslint-disable i18n/no-inline-vietnamese -- vi-allow: operator UI */
import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { fetchProductionRuns, type ProductionRunRow } from "../production-run-actions";
import { ProductionRunsClient } from "./production-runs-client";
import { resolveInventoryListScope } from "../_lib/inventory-scope";
import { AppPage, AppPageHeader } from "@/components/surface";

interface ProductionPageProps {
  searchParams?: Promise<{ branchId?: string | string[] }>;
  routeBranchId?: number;
  embedded?: boolean;
}

export async function ProductionPageContent({
  searchParams,
  routeBranchId,
  embedded = false,
}: ProductionPageProps) {
  const params = searchParams ? await searchParams : {};
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId: params.branchId,
  });
  
  if (scope.outOfScope) notFound();

  const res = await fetchProductionRuns();
  const rows: ProductionRunRow[] = res.success ? (res.data as ProductionRunRow[]) : [];

  const content = (
    <ProductionRunsClient
      initial={rows}
      branchId={scope.selectedBranchId ?? undefined}
      basePath="/inventory/production"
      embedded={embedded}
    />
  );

  if (embedded) {
    return content;
  }

  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader title="Lệnh sản xuất" />
      {content}
    </AppPage>
  );
}

export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  return <ProductionPageContent searchParams={searchParams} />;
}
