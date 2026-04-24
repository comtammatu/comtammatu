import { createClient } from "@comtammatu/database/supabase/server";
import { extractClaimsFromAccessToken } from "@comtammatu/shared/auth";
import { notFound } from "next/navigation";
import { fetchStockTransferDetail } from "../../transfer-actions";
import { formatDateTime } from "../../_lib/format";
import {
  resolveInventoryBranchScope,
  resolveRequestedBranchId,
} from "../../_lib/inventory-scope";
import { TransferDetailClient } from "./transfer-detail-client";
import type { TransferDetail } from "./transfer-detail-client";

export default async function TransferDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const { id } = await params;
  const res = await fetchStockTransferDetail(Number(id));
  if (!res.success || !res.data) notFound();
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const claims = session?.user
    ? extractClaimsFromAccessToken(session.access_token)
    : null;

  // Sidebar-selected branch scopes action enablement for tenant-wide roles.
  const sp = await searchParams;
  const requested = await resolveRequestedBranchId(sp.branchId);
  const scope = claims
    ? await resolveInventoryBranchScope(supabase, claims, requested)
    : null;

  const d = res.data as {
    transfer: {
      id: number;
      transfer_number: string;
      status: string;
      from_branch_id: number;
      to_branch_id: number;
      from_branch_name: string | null;
      to_branch_name: string | null;
      created_by: string;
      created_at: string;
      shipped_at: string | null;
      notes: string | null;
      vehicle_info: string | null;
    };
    lines: Array<{
      ingredient_id: number;
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
      ingredientId: l.ingredient_id ?? ing?.id ?? 0,
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
    id: d.transfer.id ?? Number(id),
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
    <TransferDetailClient
      transfer={transfer}
      userRole={claims?.user_role ?? "branch_manager"}
      userBranchId={scope?.selectedBranchId ?? null}
    />
  );
}
