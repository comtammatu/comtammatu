import { redirect } from "next/navigation";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";

export default async function BranchStockRequestsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: raw } = await params;
  const branchId = parseOperatorBranchId(raw);
  redirect(branchId == null ? "/br" : `/br/${branchId}/stock/transfer`);
}
