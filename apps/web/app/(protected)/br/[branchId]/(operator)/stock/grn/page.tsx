import { redirect } from "next/navigation";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";

/** D093: branch GRN retired — redirect to stock requests. */
export default async function BranchGrnRetiredPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: raw } = await params;
  const branchId = parseOperatorBranchId(raw);
  if (branchId == null) redirect("/br");
  redirect(`/br/${branchId}/stock/requests`);
}
