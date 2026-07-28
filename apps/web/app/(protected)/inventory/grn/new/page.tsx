import { GrnCreateClient } from "./[supplierId]/grn-create-client";
import { loadGrnCreatePageData } from "@lib/inventory/grn-create-data";

interface GrnNewPageProps {
  searchParams?: Promise<{
    branchId?: string | string[];
  }>;
}

export async function GrnNewPageContent({ searchParams }: GrnNewPageProps) {
  const params = searchParams ? await searchParams : {};
  const data = await loadGrnCreatePageData({
    queryBranchId: params.branchId,
    fallbackPath: "/inventory/grn",
    grnBasePath: "/inventory/grn",
  });

  return (
    <GrnCreateClient
      {...data}
      basePath="/inventory/grn"
      grnBasePath="/inventory/grn"
    />
  );
}

export default async function GrnNewPage({ searchParams }: GrnNewPageProps) {
  return <GrnNewPageContent searchParams={searchParams} />;
}
