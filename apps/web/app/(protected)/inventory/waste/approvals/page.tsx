import { redirect } from "next/navigation";
import { WasteApprovalsClient } from "./waste-approvals-client";
import { loadWasteApprovalsData } from "@lib/inventory/waste-approvals-data";

export const dynamic = "force-dynamic";

export default async function WasteApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ branchId?: string }>;
}) {
  const params = await searchParams;
  const data = await loadWasteApprovalsData({
    queryBranchId: params.branchId,
  });
  if (!data.canApproveWaste) redirect("/");

  return (
    <WasteApprovalsClient
      initial={data.rows}
      branchFilter={data.branchFilter}
    />
  );
}
