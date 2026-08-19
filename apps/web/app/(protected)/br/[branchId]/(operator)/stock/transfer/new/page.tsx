import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { resolveBranchContext } from "@/_lib/branch-context";
import { loadTransferCreatePageData } from "@lib/inventory/transfer-create-data";
import { parseTransferCreateDirection } from "@lib/inventory/transfer-paths";
import { BranchTransferCreateClient } from "./branch-transfer-create-client";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";

export default async function OperatorManualTransferNewPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{ direction?: string | string[] }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const { supabase, claims } = await loadAuthState();
  const branchContext = await resolveBranchContext(supabase, claims, branchId);
  if (!branchContext) notFound();

  const kind = branchContext.branch.branch_kind;
  if (
    kind !== "branch" &&
    kind !== "central_supply" &&
    kind !== "central_kitchen"
  ) {
    notFound();
  }

  const query = await searchParams;
  const data = await loadTransferCreatePageData({
    routeBranchId: branchId,
  });

  return (
    <BranchTransferCreateClient
      branchId={branchId}
      data={data}
      initialDirection={parseTransferCreateDirection(query.direction)}
    />
  );
}
