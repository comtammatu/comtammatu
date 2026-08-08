import { notFound, redirect } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { loadTransferCreatePageData } from "@lib/inventory/transfer-create-data";
import { BranchTransferCreateClient } from "./branch-transfer-create-client";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";

export default async function OperatorManualTransferNewPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const branchContext = await resolveBranchContext(supabase, claims, branchId);
  if (!branchContext) notFound();
  if (
    branchContext.branch.branch_kind !== "central_supply" &&
    branchContext.branch.branch_kind !== "central_kitchen"
  ) {
    redirect(`/br/${branchId}/stock/transfer`);
  }

  const data = await loadTransferCreatePageData({
    routeBranchId: branchId,
  });

  return <BranchTransferCreateClient branchId={branchId} data={data} />;
}
