import { notFound } from "next/navigation";
import { loadAuthState } from "@/_lib/auth";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { fetchStockTransferDetail } from "@/(protected)/inventory/transfer-actions";
import { formatDateTime } from "@/(protected)/inventory/_lib/format";
import { computeTransferLineTotal } from "@/(protected)/inventory/transfers/[id]/line-view-model";
import type { TransferDetail } from "@/(protected)/inventory/transfers/[id]/transfer-detail-client";
import { TransferReceiveClient } from "./transfer-receive-client";

interface TransferReceiveContentProps {
  transferId: number;
  branchId: number;
}

export async function TransferReceiveContent({
  transferId,
  branchId,
}: TransferReceiveContentProps) {
  const { supabase, claims } = await loadAuthState();

  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId: branchId,
  });
  if (scope.outOfScope) notFound();
  const scopedBranchId = scope.selectedBranchId;

  const res = await fetchStockTransferDetail(
    transferId,
    scopedBranchId ?? undefined,
  );
  if (!res.success || !res.data) notFound();

  const d = res.data as {
    transfer: {
      id: number;
      transfer_number: string;
      status: string;
      from_branch_id: number;
      to_branch_id: number;
      from_branch_name: string | null;
      to_branch_name: string | null;
      created_at: string;
      shipped_at: string | null;
      notes: string | null;
    };
    lines: Array<{
      ingredient_id: number;
      quantity: number;
      quantity_received: number | null;
      unit: string;
      unit_cost_at_ship: number | null;
      entry_unit_id: number | null;
      to_base_factor: number | null;
      unit_label: string | null;
      ingredients: {
        id: number;
        name: string;
        unit: string;
        purchase_unit: string | null;
      } | null;
    }>;
  };

  const items: TransferDetail["items"] = (d.lines ?? []).map((l) => {
    const ing = l.ingredients;
    const cost = Number(l.unit_cost_at_ship ?? 0);
    const qty = Number(l.quantity ?? 0);
    const { total } = computeTransferLineTotal({
      entryQuantity: qty,
      baseUnitCost: cost,
      entryUnitId: l.entry_unit_id ?? null,
      toBaseFactor: l.to_base_factor ?? null,
    });
    return {
      ingredientId: l.ingredient_id ?? ing?.id ?? 0,
      name: ing?.name ?? "—",
      sku: "",
      qty,
      unit: l.unit_label ?? l.unit ?? ing?.purchase_unit ?? ing?.unit ?? "",
      cost,
      total,
      received:
        l.quantity_received != null ? Number(l.quantity_received) : null,
    };
  });

  const subtotal = items.reduce((sum, i) => sum + i.total, 0);

  const transfer: TransferDetail = {
    id: d.transfer.id ?? transferId,
    code: d.transfer.transfer_number ?? "",
    status: d.transfer.status ?? "draft",
    fromBranchId: d.transfer.from_branch_id,
    toBranchId: d.transfer.to_branch_id,
    fromBranch:
      d.transfer.from_branch_name ?? `Chi nhánh #${d.transfer.from_branch_id}`,
    toBranch:
      d.transfer.to_branch_name ?? `Chi nhánh #${d.transfer.to_branch_id}`,
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

  return (
    <TransferReceiveClient
      transfer={transfer}
      backHref={`/br/${branchId}/stock/receive`}
      detailHref={`/br/${branchId}/stock/transfer/${transferId}`}
    />
  );
}
