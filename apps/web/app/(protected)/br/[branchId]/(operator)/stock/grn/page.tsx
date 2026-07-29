import { redirect } from "next/navigation";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";

export default async function BranchGrnRetiredPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: raw } = await params;
  const branchId = parseOperatorBranchId(raw);
  if (branchId == null) redirect("/br");
  redirect(`/br/${branchId}/stock/transfer`);
}
