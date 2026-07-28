import { redirect } from "next/navigation";
import { parseOperatorBranchId } from "../../../../../_lib/parse-branch-id";

export default async function BranchGrnSupplierRetiredPage({
  params,
}: {
  params: Promise<{ branchId: string; supplierId: string }>;
}) {
  const { branchId: raw } = await params;
  const branchId = parseOperatorBranchId(raw);
  if (branchId == null) redirect("/");
  redirect(`/br/${branchId}/stock/requests/new`);
}
