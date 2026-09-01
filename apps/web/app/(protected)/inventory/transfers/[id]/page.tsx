import { loadTransferDetailPageData } from "@lib/inventory/transfer-detail-data";
import { TransferDetailClient } from "./transfer-detail-client";

export default async function TransferDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ branch?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const data = await loadTransferDetailPageData({
    transferId: Number(id),
    queryBranch: query.branch,
  });
  const listHref =
    data.userBranchId == null
      ? "/inventory/transfers"
      : `/inventory/transfers?branch=${data.userBranchId}`;

  return (
    <TransferDetailClient
      transfer={data.transfer}
      userRole={data.userRole}
      userBranchId={data.userBranchId}
      correctionBranches={data.correctionBranches}
      auditLogs={data.auditLogs}
      intraSiteData={data.intraSiteData}
      listHref={listHref}
    />
  );
}
