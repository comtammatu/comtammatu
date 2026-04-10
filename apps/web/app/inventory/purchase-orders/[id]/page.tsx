import { notFound } from "next/navigation";
import { fetchIngredients } from "../../actions";
import {
  fetchGrnsForPo,
  fetchPurchaseOrderDetail,
} from "../../procurement-actions";
import type { LinkedGrnRow } from "../../procurement-actions";
import {
  PoDetailClient,
  type PoLineRow,
  type PurchaseOrderDetailRecord,
} from "./po-detail-client";
import type { IngredientRow } from "../../page";

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const num = Number(id);
  if (!Number.isFinite(num) || num <= 0) notFound();

  const [detail, ingRes, grnsRes] = await Promise.all([
    fetchPurchaseOrderDetail(num),
    fetchIngredients(),
    fetchGrnsForPo(num),
  ]);
  if (!detail.success || !detail.data) notFound();

  const { po, lines } = detail.data as {
    po: PurchaseOrderDetailRecord;
    lines: PoLineRow[];
  };
  const ingredients: IngredientRow[] = ingRes.success
    ? ((ingRes.data ?? []) as IngredientRow[])
    : [];
  const linkedGrns: LinkedGrnRow[] = grnsRes.success
    ? ((grnsRes.data ?? []) as LinkedGrnRow[])
    : [];

  return (
    <PoDetailClient
      poId={num}
      initialPo={po}
      initialLines={lines}
      ingredients={ingredients}
      linkedGrns={linkedGrns}
    />
  );
}
