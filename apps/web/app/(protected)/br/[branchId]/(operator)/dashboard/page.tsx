import { notFound, redirect } from "next/navigation";
import { parseOperatorBranchId } from "../../_lib/parse-branch-id";

export default async function BranchCommandAlias({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();
  redirect(`/br/${branchId}`);
}
