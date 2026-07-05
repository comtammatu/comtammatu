import { notFound } from "next/navigation";
import { TransferReceiveContent } from "./transfer-receive-content";

interface PageProps {
  params: Promise<{ branchId: string; id: string }>;
}

export default async function OperatorStockReceiveDetailPage({
  params,
}: PageProps) {
  const { branchId: rawBranchId, id: rawId } = await params;
  const branchId = Number(rawBranchId);
  const transferId = Number(rawId);
  if (
    !Number.isInteger(branchId) ||
    branchId <= 0 ||
    !Number.isInteger(transferId) ||
    transferId <= 0
  ) {
    notFound();
  }

  return (
    <TransferReceiveContent transferId={transferId} branchId={branchId} />
  );
}
