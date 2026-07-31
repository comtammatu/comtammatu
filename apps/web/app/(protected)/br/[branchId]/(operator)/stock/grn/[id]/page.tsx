import { notFound, redirect } from "next/navigation";
import { resolveBranchContext } from "@/_lib/branch-context";
import { loadAuthState } from "@/_lib/auth";
import { loadGrnDetail } from "@lib/inventory/grn-detail-data";
import { isGrnLookupParam } from "@lib/inventory/grn-detail-model";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";
import { BranchGrnReceiptClient } from "./branch-grn-receipt-client";
import { GrnReviewOperatorClient } from "./grn-review-operator-client";

export default async function OperatorStockGrnDetailPage({
  params,
}: {
  params: Promise<{ branchId: string; id: string }>;
}) {
  const { branchId: rawBranchId, id: rawId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();
  if (!isGrnLookupParam(rawId)) notFound();

  const { supabase, claims } = await loadAuthState();
  const branchContext = await resolveBranchContext(supabase, claims, branchId);
  if (!branchContext) notFound();
  if (branchContext.branch.branch_kind === "branch") {
    redirect(`/br/${branchId}/stock/transfer`);
  }

  const data = await loadGrnDetail(rawId, branchId);
  if (!data) notFound();

  const grnListBasePath = `/br/${branchId}/stock/grn`;
  if (data.grn.status === "draft") {
    return (
      <GrnReviewOperatorClient
        grn={data.grn}
        ingredients={data.ingredients}
        canEditDraft={data.canEditDraft}
        canConfirm={data.canConfirm}
        grnListBasePath={grnListBasePath}
      />
    );
  }

  return (
    <BranchGrnReceiptClient grn={data.grn} grnListBasePath={grnListBasePath} />
  );
}
