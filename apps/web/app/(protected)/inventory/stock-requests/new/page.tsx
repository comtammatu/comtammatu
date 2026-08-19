import { redirect } from "next/navigation";
import { controlTransferCreateHref } from "@lib/inventory/transfer-paths";

export default async function CentralKitchenStockRequestNewPage({
  searchParams,
}: {
  searchParams: Promise<{
    branch?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const branchRaw = Array.isArray(query.branch) ? query.branch[0] : query.branch;
  const branchId = branchRaw ? Number(branchRaw) : null;
  redirect(
    controlTransferCreateHref(
      "pull",
      Number.isInteger(branchId) && (branchId ?? 0) > 0 ? branchId : null,
    ),
  );
}
