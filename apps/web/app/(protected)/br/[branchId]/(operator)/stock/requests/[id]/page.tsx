import { notFound, redirect } from "next/navigation";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";

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
  redirect(`/br/${branchId}/stock/transfer`);
}
