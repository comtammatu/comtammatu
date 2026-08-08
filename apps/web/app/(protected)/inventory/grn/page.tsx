import {
  loadGrnListPageData,
  type GrnListSearchParams,
} from "@lib/inventory/grn-list-data";
import { GrnListClient } from "./grn-list-client";
import { GrnDocumentDialogHost } from "./grn-document-dialog-host";

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
        loadFailed={data.loadFailed}
        withinOwnerTabs={embedded}
      />
      <GrnDocumentDialogHost basePath={basePath} />
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
