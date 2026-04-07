import { notFound } from "next/navigation";
import { fetchIngredientsForBranch } from "../../actions";
import {
  fetchStockTransferDetail,
  resolveHeadquartersBranchId,
} from "../../transfer-actions";
import { TransferDetailClient } from "./transfer-detail-client";
import type { IngredientRow } from "../../page";

export default async function TransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const num = Number(id);
  if (!Number.isFinite(num) || num <= 0) notFound();

  const [detail, hqBranchId] = await Promise.all([
    fetchStockTransferDetail(num),
    resolveHeadquartersBranchId(),
  ]);
  if (!detail.success || !detail.data) notFound();

  const { transfer, lines } = detail.data as {
    transfer: { from_branch_id: number };
    lines: unknown[];
  };
  const fromBranchId = transfer.from_branch_id;
  const ingRes = await fetchIngredientsForBranch(fromBranchId);
  const ingredients: IngredientRow[] = ingRes.success
    ? ((ingRes.data ?? []) as IngredientRow[])
    : [];

  return (
    <TransferDetailClient
      transferId={num}
      initialTransfer={transfer as never}
      initialLines={lines as never}
      ingredients={ingredients}
      hqBranchId={hqBranchId}
    />
  );
}
