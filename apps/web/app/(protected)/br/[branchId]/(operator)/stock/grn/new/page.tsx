import { notFound } from "next/navigation";
import { GrnNewPageContent } from "@/(protected)/inventory/grn/new/page";

interface PageProps {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ branchId?: string | string[] }>;
}

export default async function OperatorStockGrnNewPage({
  params,
  searchParams,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

  return (
    <GrnNewPageContent
      searchParams={searchParams}
      routeBranchId={branchId}
      basePath={`/br/${branchId}/stock/grn/new`}
      grnListBasePath={`/br/${branchId}/stock/grn`}
      embedded
    />
  );
}
