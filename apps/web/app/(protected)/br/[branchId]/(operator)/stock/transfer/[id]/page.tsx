import { notFound, redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ branchId: string; id: string }>;
}

export default async function OperatorTransferDetailPage({
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

  redirect(
    `/br/${branchId}/stock/transfer?transferId=${transferId}&mode=view`,
  );
}
