import { redirect } from "next/navigation";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";

export default async function BranchStockRequestDetailPage({
  params,
}: {
  params: Promise<{ branchId: string; id: string }>;
}) {
  const { branchId: rawBranchId, id } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  const requestId = Number(id);
  if (
    branchId == null ||
    !Number.isInteger(requestId) ||
    requestId <= 0
  ) {
    redirect("/br");
  }
  redirect(
    `/br/${branchId}/stock/requests?requestId=${requestId}&mode=view`,
  );
}
