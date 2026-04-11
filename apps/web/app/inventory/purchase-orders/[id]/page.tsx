import { notFound } from "next/navigation";
import { fetchPurchaseOrderDetail } from "../../procurement-actions";
import { formatDate, formatDateTime } from "../../_lib/format";
import { PODetailClient } from "./po-detail-client";
import type { PODetail } from "./po-detail-client";

export default async function PODetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await fetchPurchaseOrderDetail(Number(id));
  if (!res.success || !res.data) notFound();

  const d = res.data as {
    po: {
      po_number: string;
      status: string;
      ordered_at: string;
      updated_at: string;
      suppliers: { id: number; name: string } | null;
    };
    lines: Array<{
      quantity: number;
      unit: string;
      unit_price_est: number | null;
      line_total: number | null;
      ingredients: { id: number; name: string; unit: string } | null;
    }>;
  };

  const supplier = d.po.suppliers as { id: number; name: string } | null;

  const items: PODetail["items"] = (d.lines ?? []).map((l) => {
    const ing = l.ingredients as {
      id: number;
      name: string;
      unit: string;
    } | null;
    const price = Number(l.unit_price_est ?? 0);
    const total = Number(l.line_total ?? 0);
    return {
      name: ing?.name ?? "—",
      sku: "",
      qty: Number(l.quantity ?? 0),
      unit: l.unit ?? ing?.unit ?? "",
      price,
      total,
      variance: 0,
      trend: "stable" as const,
    };
  });

  const totalAmount = items.reduce((sum, i) => sum + i.total, 0);

  const po: PODetail = {
    code: d.po.po_number ?? "",
    status: d.po.status ?? "draft",
    supplier: supplier?.name ?? "—",
    date: d.po.ordered_at ? formatDate(d.po.ordered_at) : "—",
    sentAt: d.po.updated_at ? formatDateTime(d.po.updated_at) : "—",
    total: totalAmount,
    tax: 0,
    grandTotal: totalAmount,
    supplierInfo: {
      address: "—",
      contact: "—",
      payment: "—",
    },
    items,
  };

  return <PODetailClient po={po} />;
}
