import { notFound } from "next/navigation";
import { fetchIngredients } from "../../actions";
import { fetchGrnDetail } from "../../procurement-actions";
import { GrnDetailClient } from "./grn-detail-client";
import type { IngredientRow } from "../../page";

export default async function GrnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const num = Number(id);
  if (!Number.isFinite(num) || num <= 0) notFound();

  const [detail, ingRes] = await Promise.all([
    fetchGrnDetail(num),
    fetchIngredients(),
  ]);
  if (!detail.success || !detail.data) notFound();

  const { grn, lines } = detail.data as {
    grn: Record<string, unknown>;
    lines: unknown[];
  };
  const ingredients: IngredientRow[] = ingRes.success
    ? ((ingRes.data ?? []) as IngredientRow[])
    : [];

  return (
    <GrnDetailClient
      grnId={num}
      initialGrn={grn as never}
      initialLines={lines as never}
      ingredients={ingredients}
    />
  );
}
