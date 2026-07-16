import { redirect } from "next/navigation";
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
      withinAdminDashboardTabs={embedded}
    />
  );
}

export default async function GRNListPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const params = await searchParams;
  const qParams = new URLSearchParams();
  qParams.set("tab", "grn");
  if (params.branchId) {
    if (Array.isArray(params.branchId)) {
      params.branchId.forEach((id) => qParams.append("branchId", id));
    } else {
      qParams.set("branchId", params.branchId);
    }
  }
  redirect(`/inventory/operations?${qParams.toString()}`);
}
