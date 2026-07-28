import { GrnCreateClient } from "./grn-create-client";
import { loadGrnCreatePageData } from "@lib/inventory/grn-create-data";

interface GrnCreatePageContentProps {
  supplierId: number;
  searchParams?: Promise<{ branchId?: string | string[] }>;
  routeBranchId?: number;
  basePath?: string;
  grnBasePath?: string;
}

export async function GrnCreatePageContent({
  supplierId,
  searchParams,
  routeBranchId,
  basePath = "/inventory/grn/new",
  grnBasePath = "/inventory/grn",
}: GrnCreatePageContentProps) {
  const queryParams = searchParams ? await searchParams : {};
  const data = await loadGrnCreatePageData({
    supplierId,
    queryBranchId: queryParams.branchId,
    routeBranchId,
    fallbackPath: basePath,
    grnBasePath,
  });

  return (
    <GrnCreateClient {...data} basePath={basePath} grnBasePath={grnBasePath} />
  );
}

export default async function GrnCreatePage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId: supplierIdStr } = await params;
  return <GrnCreatePageContent supplierId={Number(supplierIdStr)} />;
}
