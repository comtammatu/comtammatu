import { notFound } from "next/navigation";
import { fetchGrnDetail } from "../../procurement-actions";
import { formatDate } from "../../_lib/format";
import { GRNDetailClient } from "./grn-detail-client";
import type { GRNDetail } from "./grn-detail-client";

export default async function GRNDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await fetchGrnDetail(Number(id));
  if (!res.success || !res.data) notFound();

  const d = res.data as {
    grn: {
      grn_number: string;
      status: string;
      received_date: string | null;
      suppliers: { id: number; name: string } | null;
      purchase_orders: { id: number; po_number: string } | null;
    };
    lines: Array<{
      received_quantity: number;
      unit: string;
      unit_cost: number;
      total_cost: number;
      quality_status: string;
      receiving_temperature: number | null;
      batch_number: string | null;
      expiry_date: string | null;
      ingredients: { id: number; name: string; unit: string } | null;
    }>;
  };

  const supplier = d.grn.suppliers as { id: number; name: string } | null;
  const po = d.grn.purchase_orders as {
    id: number;
    po_number: string;
  } | null;

  const items: GRNDetail["items"] = (d.lines ?? []).map((l) => {
    const ing = l.ingredients as {
      id: number;
      name: string;
      unit: string;
    } | null;

    const qsMap: Record<string, string> = {
      accepted: "pass",
      rejected: "warning",
      partial: "warning",
    };

    return {
      name: ing?.name ?? "—",
      sku: "",
      required: Number(l.received_quantity ?? 0),
      actual: Number(l.received_quantity ?? 0),
      unit: l.unit ?? ing?.unit ?? "",
      cost: Number(l.unit_cost ?? 0),
      lot: l.batch_number ?? "—",
      expiry: l.expiry_date ? formatDate(l.expiry_date) : "—",
      temp:
        l.receiving_temperature != null ? `${l.receiving_temperature}°C` : null,
      status: qsMap[l.quality_status] ?? "pass",
    };
  });

  const totalAmount = items.reduce((sum, i) => sum + i.cost * i.actual, 0);

  const grn: GRNDetail = {
    id: Number(id),
    code: d.grn.grn_number ?? "",
    poCode: po?.po_number ?? "",
    poId: po?.id,
    supplier: supplier?.name ?? "—",
    date: d.grn.received_date ? formatDate(d.grn.received_date) : "—",
    total: totalAmount,
    tax: 0,
    status: d.grn.status ?? "draft",
    items,
  };

  return <GRNDetailClient grn={grn} />;
}
