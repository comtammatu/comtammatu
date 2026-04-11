import { notFound } from "next/navigation";
import { fetchStocktakeDetail } from "../../actions";
import { formatDateTime } from "../../_lib/format";
import { StocktakeDetailClient } from "./stocktake-detail-client";
import type { StocktakeDetail } from "./stocktake-detail-client";

export default async function StocktakeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await fetchStocktakeDetail(Number(id));
  if (!res.success || !res.data) notFound();

  const d = res.data as {
    session: {
      id: number;
      branch_id: number;
      started_at: string;
      completed_at: string | null;
      status: string;
      notes: string | null;
    };
    lines: Array<{
      system_quantity: number;
      counted_quantity: number | null;
      variance: number | null;
      variance_reason: string | null;
      ingredients: {
        id: number;
        name: string;
        unit: string;
        category: string | null;
      } | null;
    }>;
  };

  const lines = d.lines ?? [];
  const totalItems = lines.length;
  const countedItems = lines.filter((l) => l.counted_quantity != null).length;
  const progress =
    totalItems > 0 ? Math.round((countedItems / totalItems) * 100) : 0;

  const totalVarianceValue = lines.reduce(
    (sum, l) => sum + Number(l.variance ?? 0),
    0,
  );

  const items: StocktakeDetail["items"] = lines.map((l) => {
    const ing = l.ingredients as {
      id: number;
      name: string;
      unit: string;
      category: string | null;
    } | null;
    const sysQty = Number(l.system_quantity ?? 0);
    const cntQty =
      l.counted_quantity != null ? Number(l.counted_quantity) : null;
    const variance = l.variance != null ? Number(l.variance) : null;
    const pct =
      sysQty > 0 && variance != null ? (variance / sysQty) * 100 : null;

    return {
      name: ing?.name ?? "—",
      sku: "",
      unit: ing?.unit ?? "",
      system: sysQty,
      counted: cntQty,
      variance,
      pct: pct != null ? Math.round(pct * 100) / 100 : null,
      reason: l.variance_reason ?? "",
    };
  });

  const session: StocktakeDetail = {
    code: `ST-${d.session.id}`,
    status: d.session.status ?? "in_progress",
    branch: `Chi nhánh #${d.session.branch_id}`,
    startDate: d.session.started_at
      ? formatDateTime(d.session.started_at)
      : "—",
    progress,
    totalItems,
    counted: countedItems,
    totalVarianceValue,
    items,
  };

  return <StocktakeDetailClient session={session} />;
}
