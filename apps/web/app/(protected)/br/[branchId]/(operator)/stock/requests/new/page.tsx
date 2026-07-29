import { redirect } from "next/navigation";
import { parseOperatorBranchId } from "../../../../_lib/parse-branch-id";
import { createStockRequestDraft } from "@/(protected)/inventory/stock-request-actions";

export default async function BranchStockRequestNewPage({
  params,
}: {
  params: Promise<{ branchId: string }>;
}) {
  const { branchId: raw } = await params;
  const branchId = parseOperatorBranchId(raw);
  if (branchId == null) redirect("/br");

  const result = await createStockRequestDraft({ branchId });
  if (result.success && result.data) {
    redirect(`/br/${branchId}/stock/requests/${result.data.requestId}`);
  }
  redirect(`/br/${branchId}/stock/requests`);
}
