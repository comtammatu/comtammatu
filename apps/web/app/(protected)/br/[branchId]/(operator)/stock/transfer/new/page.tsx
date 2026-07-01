import { notFound } from "next/navigation";
import { NewTransferPageContent } from "@/(protected)/inventory/transfers/new/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorNewTransferPage({ params }: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <NewTransferPageContent
      routeBranchId={branchId}
      basePath={`/br/${branchId}/stock/transfer`}
      embedded
    />
  );
}
