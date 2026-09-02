import { notFound, redirect } from "next/navigation";
import { PURCHASE_ORDER_CREATE_HREF } from "@lib/inventory/purchase-order-paths";
import { parseOperatorBranchId } from "../../../_lib/parse-branch-id";

// Retained reference for finished goods purchase constraint: filterPurchasedIngredientRows

export default async function OperatorPurchaseRequestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ branchId: string }>;
  searchParams: Promise<{
    mode?: string | string[];
  }>;
}) {
  const { branchId: rawBranchId } = await params;
  const branchId = parseOperatorBranchId(rawBranchId);
  if (branchId == null) notFound();

  const query = await searchParams;
  const mode = Array.isArray(query.mode) ? query.mode[0] : query.mode;
  if (mode === "create" || mode === "create-po") {
    redirect(PURCHASE_ORDER_CREATE_HREF);
  }
  redirect(`/br/${branchId}/stock`);
}
