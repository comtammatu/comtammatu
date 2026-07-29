import {
  loadGrnListPageData,
  type GrnListSearchParams,
} from "@lib/inventory/grn-list-data";
import { GrnListClient } from "./grn-list-client";
import { loadGrnDetailResult } from "@lib/inventory/grn-detail-data";
import { isGrnLookupParam } from "@lib/inventory/grn-detail-model";
import { messages } from "@lib/messages";
import { GRNDetailClient } from "./[id]/grn-detail-client";

interface GRNListPageContentProps {
  searchParams: Promise<GrnListSearchParams>;
  basePath?: string;
  embedded?: boolean;
}

export async function GRNListPageContent({
  searchParams,
  basePath = "/inventory/grn",
  embedded = false,
}: GRNListPageContentProps) {
  const params = await searchParams;
  const data = await loadGrnListPageData(params);
  const rawGrnId = Array.isArray(params.grnId) ? params.grnId[0] : params.grnId;
  const grnKey =
    rawGrnId != null && isGrnLookupParam(rawGrnId) ? rawGrnId : null;
  const detail = grnKey == null ? null : await loadGrnDetailResult(grnKey);
  const detailError =
    rawGrnId == null || detail?.data
      ? null
      : (detail?.error ?? messages.inventory.grn.notFound);

  return (
    <>
      <GrnListClient
        rows={data.rows}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        filters={data.filters}
        basePath={basePath}
        canManageSupplierInvoice={data.canManageSupplierInvoice}
        canViewMonetary={data.canViewMonetary}
        loadFailed={data.loadFailed}
        withinOwnerTabs={embedded}
        detailError={detailError}
      />
      {detail?.data ? (
        <GRNDetailClient
          grn={detail.data.grn}
          ingredients={detail.data.ingredients}
          canAdjustStock={detail.data.canAdjustStock}
          canAmendConfirmed={detail.data.canAmendConfirmed}
          canEditDraft={detail.data.canEditDraft}
          canConfirm={detail.data.canConfirm}
          canManageSupplierInvoice={detail.data.canManageSupplierInvoice}
          receivingLocationOptions={detail.data.receivingLocationOptions}
          auditLogs={detail.data.auditLogs}
          presentation="dialog"
        />
      ) : null}
    </>
  );
}

export default async function GRNListPage({
  searchParams,
}: {
  searchParams: Promise<GrnListSearchParams>;
}) {
  return <GRNListPageContent searchParams={searchParams} />;
}
