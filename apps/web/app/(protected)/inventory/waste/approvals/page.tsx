import { redirect } from "next/navigation";
import { WasteApprovalsClient } from "./waste-approvals-client";
import { loadWasteApprovalsData } from "@lib/inventory/waste-approvals-data";

export default async function WasteApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string | string[] }>;
}) {
  const params = await searchParams;
  const data = await loadWasteApprovalsData({
    queryBranch: params.branch,
  });
  if (!data.canApproveWaste) redirect("/");

  return (
    <WasteApprovalsClient
      initial={data.rows}
      branchFilter={data.branchFilter}
      loadFailed={data.loadFailed}
    />
  );
}
