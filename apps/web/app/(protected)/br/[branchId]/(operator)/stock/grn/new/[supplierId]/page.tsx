import { notFound, redirect } from "next/navigation";
import { resolveBranchContext } from "@/_lib/branch-context";
import { loadAuthState } from "@/_lib/auth";
import { parseOperatorBranchId } from "../../../../../_lib/parse-branch-id";

interface PageProps {
  params: Promise<{ branchId: string; supplierId: string }>;
}

export default async function OperatorStockGrnCreatePage({
  params,
}: PageProps) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const branchContext = await resolveBranchContext(supabase, claims, branchId);
  if (!branchContext) notFound();
  if (branchContext.branch.branch_kind === "branch") {
    redirect(`/br/${branchId}/stock/requests/new`);
  }
  redirect(`/br/${branchId}/stock/purchase-requests`);
}
