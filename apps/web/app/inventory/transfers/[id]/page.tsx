import { notFound } from "next/navigation";
import { fetchStockTransferDetail } from "../../transfer-actions";
import { formatDateTime } from "../../_lib/format";
import { TransferDetailClient } from "./transfer-detail-client";
import type { TransferDetail } from "./transfer-detail-client";

export default async function TransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await fetchStockTransferDetail(Number(id));
  if (!res.success || !res.data) notFound();

  const d = res.data as {
    transfer: {
      transfer_number: string;
      status: string;
      from_branch_id: number;
      to_branch_id: number;
      created_by: string;
      created_at: string;
      shipped_at: string | null;
      notes: string | null;
      vehicle_info: string | null;
    };
    lines: Array<{
      quantity: number;
      quantity_received: number | null;
      unit: string;
      unit_cost_at_ship: number | null;
      ingredients: { id: number; name: string; unit: string } | null;
    }>;
  };

  const items: TransferDetail["items"] = (d.lines ?? []).map((l) => {
    const ing = l.ingredients as {
      id: number;
      name: string;
      unit: string;
    } | null;
    const cost = Number(l.unit_cost_at_ship ?? 0);
    const qty = Number(l.quantity ?? 0);
    return {
      name: ing?.name ?? "—",
      sku: "",
      qty,
      unit: l.unit ?? ing?.unit ?? "",
      cost,
      total: cost * qty,
      received:
        l.quantity_received != null ? Number(l.quantity_received) : null,
    };
  });

  const subtotal = items.reduce((sum, i) => sum + i.total, 0);

  const transfer: TransferDetail = {
    code: d.transfer.transfer_number ?? "",
    status: d.transfer.status ?? "draft",
    fromBranch: `Chi nhánh #${d.transfer.from_branch_id}`,
    toBranch: `Chi nhánh #${d.transfer.to_branch_id}`,
    createdBy: "—",
    date: d.transfer.shipped_at
      ? formatDateTime(d.transfer.shipped_at)
      : d.transfer.created_at
        ? formatDateTime(d.transfer.created_at)
        : "—",
    note: d.transfer.notes ?? null,
    subtotal,
    shipping: 0,
    total: subtotal,
    items,
  };

  return <TransferDetailClient transfer={transfer} />;
}
