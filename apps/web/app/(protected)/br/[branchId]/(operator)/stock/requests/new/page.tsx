import { notFound, redirect } from "next/navigation";
import { branchTransferCreateHref } from "@lib/inventory/transfer-paths";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";

export default async function BranchStockRequestNewPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();
  redirect(branchTransferCreateHref(branchId, "pull"));
}
