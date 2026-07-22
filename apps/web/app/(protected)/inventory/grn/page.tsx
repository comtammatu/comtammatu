import { loadGrnListPageData } from "@lib/inventory/grn-list-data";
import { GrnListClient } from "./grn-list-client";

interface GRNListPageContentProps {
  searchParams: Promise<{ branchId?: string | string[] }>;
  basePath?: string;
  showDrafts?: boolean;
  embedded?: boolean;
}

export async function GRNListPageContent({
  searchParams,
  basePath = "/inventory/grn",
  showDrafts = true,
  embedded = false,
}: GRNListPageContentProps) {
  const params = await searchParams;
  const data = await loadGrnListPageData({
    includeDrafts: showDrafts,
    queryBranchId: params.branchId,
  });

  return (
    <GrnListClient
      grns={data.grns}
      basePath={basePath}
      canCreate={data.canCreate}
      drafts={showDrafts && data.canCreate ? data.drafts : undefined}
      draftsLoadFailed={showDrafts && data.canCreate && data.draftsLoadFailed}
      grnsLoadFailed={data.grnsLoadFailed}
      withinOwnerTabs={embedded}
    />
  );
}

export default async function GRNListPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  return <GRNListPageContent searchParams={searchParams} />;
}
