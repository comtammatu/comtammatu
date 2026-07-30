import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { StockRequestDetailView } from "@/components/stock-request-detail-view";
import { loadStockRequestDetail } from "@lib/inventory/stock-request-detail-data";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";
import { StockRequestBranchActions } from "./stock-request-branch-actions";

export default async function BranchStockRequestDetailPage({
  params,
}: {
  params: Promise<{ branchId: string; id: string }>;
}) {
  const { branchId: rawBranchId, id: rawId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  const requestId = Number(rawId);
  if (branchId == null || !Number.isInteger(requestId) || requestId <= 0) {
    notFound();
  }

  const { supabase, claims } = await loadAuthState();
  const branchContext = await resolveBranchContext(supabase, claims, branchId);
  if (!branchContext || branchContext.branch.branch_kind !== "branch") {
    notFound();
  }
  const data = await loadStockRequestDetail({
    supabase,
    tenantId: claims.tenant_id,
    requestId,
    branchId,
  });
  if (!data) notFound();
  const editable =
    ["draft", "submitted"].includes(data.status) &&
    data.items.every((item) => item.status === "pending");

  return (
    <StockRequestDetailView
      data={data}
      mode="branch"
      actions={
        <StockRequestBranchActions
          branchId={branchId}
          requestId={requestId}
          editable={editable}
        />
      }
    />
  );
}
