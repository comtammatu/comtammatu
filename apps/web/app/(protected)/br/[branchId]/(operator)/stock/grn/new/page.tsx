import { notFound, redirect } from "next/navigation";
import { BranchGrnSourcePickerClient } from "./branch-grn-source-picker-client";
import { loadGrnSourcePageData } from "@lib/inventory/grn-source-data";
import {
  grnSourceSupplierHref,
  parseGrnSupplierIdParam,
} from "@lib/inventory/grn-source-model";

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
  const branchId = Number(rawBranchId);
  if (!Number.isInteger(branchId) || branchId <= 0) notFound();

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
      openPurchaseOrders={data.openPurchaseOrders}
      openPurchaseOrdersLoadFailed={data.openPurchaseOrdersLoadFailed}
    />
  );
}
