import { notFound } from "next/navigation";
import { WasteNewPageContent } from "@/(protected)/inventory/waste/new/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
}

export default async function OperatorStockWastePage({
  params,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <WasteNewPageContent
      routeBranchId={branchId}
      successHref={`/br/${branchId}/stock`}
      cancelHref={`/br/${branchId}/stock`}
      embedded
    />
  );
}
