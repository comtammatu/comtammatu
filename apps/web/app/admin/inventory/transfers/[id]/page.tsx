import { notFound } from "next/navigation";
import { fetchIngredients } from "../../actions";
import { fetchStockTransferDetail } from "../../transfer-actions";
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

  const [detail, ingRes] = await Promise.all([
    fetchStockTransferDetail(num),
    fetchIngredients(),
  ]);
  if (!detail.success || !detail.data) notFound();

  const { transfer, lines } = detail.data as {
    transfer: Record<string, unknown>;
    lines: unknown[];
  };
  const ingredients: IngredientRow[] = ingRes.success
    ? ((ingRes.data ?? []) as IngredientRow[])
    : [];

  return (
    <TransferDetailClient
      transferId={num}
      initialTransfer={transfer as never}
      initialLines={lines as never}
      ingredients={ingredients}
    />
  );
}
