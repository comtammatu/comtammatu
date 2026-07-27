import { notFound } from "next/navigation";
import { ERRORS_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import { AppEmptyState, AppPage, AppPageHeader } from "@/components/surface";
import { tRoute } from "../../_lib/dictionary";
import { loadGrnDetailResult } from "@lib/inventory/grn-detail-data";
import { isGrnLookupParam } from "@lib/inventory/grn-detail-model";
import { GRNDetailClient } from "./grn-detail-client";

interface GRNDetailPageContentProps {
  grnId: number | string;
  routeBranchId?: number;
  grnListBasePath?: string;
  grnMobileBackPath?: string;
  supplierInvoicesBasePath?: string;
}

function GrnDetailLoadError({ error }: { error: string }) {
  return (
    <AppPage width="xwide" density="compact">
      <AppPageHeader
        eyebrow={messages.inventory.shell.moduleName}
        title={tRoute("/inventory/grn", "heading")}
      />
      <AppEmptyState
        mode="error"
        title={ERRORS_VI.loadFailed}
        description={error}
      />
    </AppPage>
  );
}

export async function GRNDetailPageContent({
  grnId,
  routeBranchId,
  grnListBasePath = "/inventory/grn",
  grnMobileBackPath = "/inventory/grn/new",
  supplierInvoicesBasePath = "/finance/supplier-invoices",
}: GRNDetailPageContentProps) {
  const result = await loadGrnDetailResult(grnId, routeBranchId);
  if (!result.data) {
    if (result.error && !result.notFound) {
      return <GrnDetailLoadError error={result.error} />;
    }
    notFound();
  }

  return (
    <GRNDetailClient
      grn={result.data.grn}
      ingredients={result.data.ingredients}
      canAdjustStock={result.data.canAdjustStock}
      canAmendConfirmed={result.data.canAmendConfirmed}
      recreateLocationOptions={result.data.recreateLocationOptions}
      auditLogs={result.data.auditLogs}
      grnListBasePath={grnListBasePath}
      grnMobileBackPath={grnMobileBackPath}
      supplierInvoicesBasePath={supplierInvoicesBasePath}
    />
  );
}

export default async function GRNDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isGrnLookupParam(id)) notFound();
  return <GRNDetailPageContent grnId={id} />;
}
