import { loadTransferDetailPageData } from "@lib/inventory/transfer-detail-data";
import { TransferDetailClient } from "./transfer-detail-client";

interface TransferDetailPageContentProps {
  transferId: number;
  searchParams?: Promise<{ branchId?: string | string[] }>;
  routeBranchId?: number;
  basePath?: string;
}

export async function TransferDetailPageContent({
  transferId,
  searchParams,
  routeBranchId,
  basePath = "/inventory/transfers",
}: TransferDetailPageContentProps) {
  const params = searchParams ? await searchParams : {};
  const data = await loadTransferDetailPageData({
    transferId,
    routeBranchId,
    queryBranchId: params.branchId,
  });
  const listHref =
    routeBranchId != null
      ? basePath
      : data.userBranchId != null
        ? `${basePath}?branchId=${data.userBranchId}`
        : basePath;

  return (
    <TransferDetailClient
      transfer={data.transfer}
      userRole={data.userRole}
      userBranchId={data.userBranchId}
      correctionBranches={data.correctionBranches}
      auditLogs={data.auditLogs}
      embedded={routeBranchId != null}
      listHref={listHref}
    />
  );
}

export default async function TransferDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const { id } = await params;
  return (
    <TransferDetailPageContent
      transferId={Number(id)}
      searchParams={searchParams}
    />
  );
}
