import { redirect } from "next/navigation";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";

/**
 * Redirect shim — leave approvals live under the Team hub
 * (`/br/{branchId}/team?tab=leaves`) as of the Branch Manager IA redesign.
 */
export default async function OperatorLeaveApprovalsPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) redirect("/br");
  redirect(`/br/${branchId}/team?tab=leaves`);
}
