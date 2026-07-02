import { loadAuthState } from "@/_lib/auth";
import {
  PERMISSION_KEYS,
} from "@comtammatu/shared/auth";
import { currentUserHasPermission } from "@/_lib/permissions";
import { notFound } from "next/navigation";
import { fetchStockTransferDetail } from "../../transfer-actions";
import { fetchEntityAuditLogs } from "@/_lib/audit";
import { formatDateTime } from "../../_lib/format";
import { resolveInventoryListScope } from "../../_lib/inventory-scope";
import { TransferDetailClient } from "./transfer-detail-client";
import type { TransferDetail } from "./transfer-detail-client";

interface TransferDetailPageContentProps {
  transferId: number;
  searchParams?: Promise<{ branchId?: string | string[] }>;
  routeBranchId?: number;
  basePath?: string;
}

export async function TransferDetailPageContent({
  transferId,
  searchParams,
  routeBranchId,
  basePath = "/inventory/transfers",
}: TransferDetailPageContentProps) {
  const { supabase, claims } = await loadAuthState();

  // Sidebar-selected branch scopes action enablement for tenant-wide roles.
  const sp = searchParams ? await searchParams : {};
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId: sp.branchId,
  });
  const scopedBranchId = scope.selectedBranchId;
  if (scope.outOfScope) notFound();

  const [res, auditLogs] = await Promise.all([
    fetchStockTransferDetail(transferId, scopedBranchId ?? undefined),
    fetchEntityAuditLogs("stock_transfer", transferId, 50),
  ]);
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
      ingredients: {
        id: number;
        name: string;
        unit: string;
        purchase_unit: string | null;
      } | null;
    }>;
  };

  const items: TransferDetail["items"] = (d.lines ?? []).map((l) => {
    const ing = l.ingredients as {
      id: number;
      name: string;
      unit: string;
      purchase_unit: string | null;
    } | null;
    const cost = Number(l.unit_cost_at_ship ?? 0);
    const qty = Number(l.quantity ?? 0);
    return {
      ingredientId: l.ingredient_id ?? ing?.id ?? 0,
      name: ing?.name ?? "—",
      sku: "",
      qty,
      unit: l.unit ?? ing?.purchase_unit ?? ing?.unit ?? "",
      cost,
      total: cost * qty,
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
  const [canAdjustFrom, canAdjustTo] = await Promise.all([
    currentUserHasPermission(
      d.transfer.from_branch_id,
      PERMISSION_KEYS.INVENTORY_WRITE,
    ),
    currentUserHasPermission(
      d.transfer.to_branch_id,
      PERMISSION_KEYS.INVENTORY_WRITE,
    ),
  ]);
  const correctionBranches = [
    canAdjustFrom
      ? {
          id: d.transfer.from_branch_id,
          name:
            d.transfer.from_branch_name ??
            `Chi nhánh #${d.transfer.from_branch_id}`,
        }
      : null,
    canAdjustTo && d.transfer.status === "received"
      ? {
          id: d.transfer.to_branch_id,
          name:
            d.transfer.to_branch_name ??
            `Chi nhánh #${d.transfer.to_branch_id}`,
        }
      : null,
  ].filter((branch): branch is { id: number; name: string } => branch != null);

  return (
    <TransferDetailClient
      transfer={transfer}
      userRole={claims.user_role}
      userBranchId={scopedBranchId}
      correctionBranches={correctionBranches}
      auditLogs={auditLogs}
      embedded={routeBranchId != null}
      listHref={
        routeBranchId != null
          ? basePath
          : scopedBranchId != null
            ? `${basePath}?branchId=${scopedBranchId}`
            : basePath
      }
    />
  );
}

export default async function TransferDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const { id } = await params;
  return (
    <TransferDetailPageContent
      transferId={Number(id)}
      searchParams={searchParams}
    />
  );
}
