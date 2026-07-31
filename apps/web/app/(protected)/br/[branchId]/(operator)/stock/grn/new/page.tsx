import { notFound, redirect } from "next/navigation";
import { resolveBranchContext } from "@/_lib/branch-context";
import { loadAuthState } from "@/_lib/auth";
import { loadGrnSourcePageData } from "@lib/inventory/grn-source-data";
import {
  grnSourceSupplierHref,
  parseGrnSupplierIdParam,
} from "@lib/inventory/grn-source-model";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";
import { BranchGrnSourcePickerClient } from "./branch-grn-source-picker-client";

interface PageProps {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{
    branchId?: string | string[];
    supplierId?: string | string[];
  }>;
}

export default async function OperatorStockGrnNewPage({
  params: routeParams,
  searchParams,
}: PageProps) {
  const { branchId: rawBranchId } = await routeParams;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const branchContext = await resolveBranchContext(supabase, claims, branchId);
  if (!branchContext) notFound();
  if (branchContext.branch.branch_kind === "branch") {
    redirect(`/br/${branchId}/stock/requests/new`);
  }

  const query = await searchParams;
  const sourceBasePath = `/br/${branchId}/stock/grn/new`;
  const selectedSupplierId = parseGrnSupplierIdParam(query.supplierId);
  if (selectedSupplierId != null) {
    redirect(grnSourceSupplierHref(sourceBasePath, selectedSupplierId));
  }

  const data = await loadGrnSourcePageData({
    routeBranchId: branchId,
    queryBranchId: query.branchId,
  });
  if (data.branchId !== branchId) notFound();

  return (
    <BranchGrnSourcePickerClient
      branchId={branchId}
      canCreateSupplier={data.canCreateSupplier}
      suppliers={data.suppliers}
      suppliersLoadFailed={data.suppliersLoadFailed}
    />
  );
}
