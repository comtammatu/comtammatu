import "server-only";

import { notFound, redirect } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermission } from "@/_lib/permissions";
import { getBranchSiteDisplayName } from "@/(protected)/inventory/_lib/branch-site-labels";
import {
  resolveInventoryBranchScope,
  resolveInventoryListScope,
} from "@/(protected)/inventory/_lib/inventory-scope";
import {
  fetchReturnableGrns,
  fetchSupplierReturnDetail,
  fetchSupplierReturns,
  type ReturnableGrnRow,
} from "@/(protected)/inventory/supplier-return-actions";
import {
  toBranchSupplierReturnStatus,
  type BranchReturnableGrn,
  type BranchSupplierReturn,
  type BranchSupplierReturnDetail,
  type BranchSupplierReturnLine,
} from "./supplier-return-model";

type SupplierReturnListRow = {
  id: number;
  return_number: string | null;
  status: string;
  reason: string;
  resolution: string;
  created_at: string;
  confirmed_at: string | null;
  notes?: string | null;
  branch_id: number;
  suppliers: { id: number; name: string } | null;
  goods_received_notes: { id: number; grn_number: string } | null;
};

type SupplierReturnDetailRow = {
  header: SupplierReturnListRow;
  lines: Array<{
    id: number;
    ingredient_id: number;
    quantity: number;
    unit: string;
    reason_detail: string | null;
    ingredients: { id: number; name: string; unit: string } | null;
  }>;
};

function toBranchSupplierReturn(
  row: SupplierReturnListRow,
): BranchSupplierReturn {
  return {
    id: row.id,
    code: row.return_number || `THNCC-${row.id}`,
    status: toBranchSupplierReturnStatus(row.status),
    reason: row.reason,
    resolution: row.resolution,
    createdAt: row.created_at,
    sentAt: row.confirmed_at,
    notes: row.notes ?? null,
    branchId: row.branch_id,
    supplierName: row.suppliers?.name ?? "Không rõ NCC",
    grnId: row.goods_received_notes?.id ?? null,
    grnNumber: row.goods_received_notes?.grn_number ?? null,
  };
}

function toBranchSupplierReturnLine(
  row: SupplierReturnDetailRow["lines"][number],
): BranchSupplierReturnLine {
  return {
    id: row.id,
    ingredientId: row.ingredient_id,
    ingredientName: row.ingredients?.name ?? `#${row.ingredient_id}`,
    quantity: Number(row.quantity ?? 0),
    unit: row.ingredients?.unit ?? row.unit,
    reasonDetail: row.reason_detail,
  };
}

function toBranchReturnableGrn(row: ReturnableGrnRow): BranchReturnableGrn {
  return {
    id: row.id,
    code: row.grn_number,
    receivedDate: row.received_date,
    supplierName: row.supplier_name,
    rejectedLines: row.rejected_lines,
  };
}

export async function loadBranchSupplierReturnListData(routeBranchId: number) {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
  });
  if (scope.outOfScope || scope.selectedBranchId !== routeBranchId) notFound();

  const [returnsResult, canCreate] = await Promise.all([
    fetchSupplierReturns(routeBranchId),
    currentUserHasPermission(
      routeBranchId,
      PERMISSION_KEYS.SUPPLIER_RETURN_CREATE,
    ),
  ]);

  const returns = returnsResult.success
    ? ((returnsResult.data ?? []) as SupplierReturnListRow[]).map(
        toBranchSupplierReturn,
      )
    : [];
  const branch = scope.allowedBranches.find(
    (item) => item.id === routeBranchId,
  );

  return {
    branchId: routeBranchId,
    branchName: branch
      ? getBranchSiteDisplayName(branch)
      : `CN #${routeBranchId}`,
    returns,
    canCreate,
  };
}

export async function loadBranchSupplierReturnCreateData(
  routeBranchId: number,
) {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
  });
  if (scope.outOfScope || scope.selectedBranchId !== routeBranchId) notFound();

  const canCreate = await currentUserHasPermission(
    routeBranchId,
    PERMISSION_KEYS.SUPPLIER_RETURN_CREATE,
  );
  if (!canCreate) redirect("/access-denied?reason=insufficient-permission");

  const returnableResult = await fetchReturnableGrns(routeBranchId);
  const returnableGrns = returnableResult.success
    ? (returnableResult.data ?? []).map(toBranchReturnableGrn)
    : [];
  const branch = scope.allowedBranches.find(
    (item) => item.id === routeBranchId,
  );

  return {
    branchId: routeBranchId,
    branchName: branch
      ? getBranchSiteDisplayName(branch)
      : `CN #${routeBranchId}`,
    returnableGrns,
  };
}

export async function loadBranchSupplierReturnDetailData(
  returnId: number,
  routeBranchId: number,
): Promise<BranchSupplierReturnDetail> {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryBranchScope(
    supabase,
    claims,
    routeBranchId,
  );
  if (scope.selectedBranchId !== routeBranchId) notFound();

  const [detailResult, canConfirm] = await Promise.all([
    fetchSupplierReturnDetail(returnId),
    currentUserHasPermission(
      routeBranchId,
      PERMISSION_KEYS.SUPPLIER_RETURN_CONFIRM,
    ),
  ]);
  if (!detailResult.success || !detailResult.data) notFound();

  const detail = detailResult.data as SupplierReturnDetailRow;
  if (detail.header.branch_id !== routeBranchId) notFound();

  return {
    returnRecord: toBranchSupplierReturn(detail.header),
    lines: detail.lines.map(toBranchSupplierReturnLine),
    canConfirm,
  };
}
