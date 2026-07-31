import { notFound, redirect } from "next/navigation";
import { resolveBranchContext } from "@/_lib/branch-context";
import { loadAuthState } from "@/_lib/auth";
import { loadGrnCreatePageData } from "@lib/inventory/grn-create-data";
import { parseOperatorBranchId } from "../../../../../_lib/parse-branch-id";
import { BranchGrnCreateClient } from "./branch-grn-create-client";

interface PageProps {
  params: Promise<{ branchId: string; supplierId: string }>;
  searchParams: Promise<{ branchId?: string | string[] }>;
}

export default async function OperatorStockGrnCreatePage({
  params,
  searchParams,
}: PageProps) {
  const { branchId: rawBranchId, supplierId: rawSupplierId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  const supplierId = Number(rawSupplierId);
  if (
    branchId == null ||
    !Number.isInteger(supplierId) ||
    supplierId <= 0
  ) {
    notFound();
  }

  const { supabase, claims } = await loadAuthState();
  const branchContext = await resolveBranchContext(supabase, claims, branchId);
  if (!branchContext) notFound();
  if (branchContext.branch.branch_kind === "branch") {
    redirect(`/br/${branchId}/stock/requests/new`);
  }

  const queryParams = await searchParams;
  const sourceBasePath = `/br/${branchId}/stock/grn/new`;
  const grnBasePath = `/br/${branchId}/stock/grn`;
  const data = await loadGrnCreatePageData({
    queryBranchId: queryParams.branchId,
    routeBranchId: branchId,
    fallbackPath: sourceBasePath,
    grnBasePath,
  });

  return (
    <BranchGrnCreateClient
      {...data}
      sourceBasePath={sourceBasePath}
      grnBasePath={grnBasePath}
    />
  );
}
