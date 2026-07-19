import "server-only";

import { notFound, redirect } from "next/navigation";
import {
  canAccess,
  PERMISSION_KEYS,
  PROCUREMENT_ROLES,
} from "@comtammatu/shared/auth";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import {
  diffVNDateDays,
  formatVNDate,
  getVNDateString,
} from "@comtammatu/shared/time";
import { loadAuthState, probePermission } from "@/_lib/auth";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import type { TenantSupabase } from "@lib/inventory/types";
import type { GrnSourceSupplier } from "./grn-source-model";

type SupplierDbRow = {
  id: number;
  name: string;
  phone: string | null;
};

type GrnSupplierRow = {
  supplier_id: number;
  received_date: string | null;
};

type SupplierLoadResult = {
  suppliers: GrnSourceSupplier[];
  loadFailed: boolean;
};

export type GrnSourcePageData = {
  branchId: number | null;
  canCreateSupplier: boolean;
  suppliers: GrnSourceSupplier[];
  suppliersLoadFailed: boolean;
};

async function loadSuppliers(
  tenantId: number,
  supabase: TenantSupabase,
  branchId: number | null,
): Promise<SupplierLoadResult> {
  let grnQuery = supabase
    .from("goods_received_notes")
    .select("supplier_id, received_date")
    .eq("tenant_id", tenantId)
    .order("received_date", { ascending: false })
    .limit(200);

  if (branchId != null) {
    grnQuery = grnQuery.eq("branch_id", branchId);
  }

  const [suppliersRes, grnRes] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, phone")
      .eq("tenant_id", tenantId)
      .order("name"),
    grnQuery,
  ]);

  if (suppliersRes.error) {
    return { suppliers: [], loadFailed: true };
  }

  const suppliers = (suppliersRes.data ?? []) as SupplierDbRow[];
  const grns = (grnRes.data ?? []) as GrnSupplierRow[];
  const recentMap = new Map<number, { count: number; last: string | null }>();

  for (const grn of grns) {
    const entry = recentMap.get(grn.supplier_id) ?? { count: 0, last: null };
    entry.count += 1;
    if (grn.received_date && (!entry.last || grn.received_date > entry.last)) {
      entry.last = grn.received_date;
    }
    recentMap.set(grn.supplier_id, entry);
  }

  const rows = suppliers.map((supplier) => {
    const recent = recentMap.get(supplier.id);
    return {
      id: supplier.id,
      name: supplier.name,
      phone: supplier.phone,
      recentLabel: recent && recent.count > 0 ? `${recent.count} phiếu` : null,
      lastLabel: formatLastGrn(recent?.last ?? null),
    };
  });

  rows.sort((left, right) => {
    const leftCount = recentMap.get(left.id)?.count ?? 0;
    const rightCount = recentMap.get(right.id)?.count ?? 0;
    if (leftCount !== rightCount) return rightCount - leftCount;
    return left.name.localeCompare(right.name, "vi");
  });

  return { suppliers: rows, loadFailed: false };
}

function formatLastGrn(iso: string | null): string | null {
  if (!iso) return null;

  const days = diffVNDateDays(getVNDateString(iso), getVNDateString());
  if (days <= 0) return INVENTORY_VI.today;
  if (days === 1) return INVENTORY_VI.yesterday;
  if (days < 7) return INVENTORY_VI.daysAgo(days);
  if (days < 30) return `${Math.floor(days / 7)} tuần trước`;
  return formatVNDate(iso);
}

export async function loadGrnSourcePageData({
  queryBranchId,
  routeBranchId,
}: {
  queryBranchId?: string | string[];
  routeBranchId?: number;
} = {}): Promise<GrnSourcePageData> {
  const auth = await loadAuthState();
  const { supabase, claims } = auth;
  if (
    !PROCUREMENT_ROLES.includes(claims.user_role) ||
    !canAccess(claims.user_role, "branch_stock")
  ) {
    redirect("/access-denied?reason=insufficient-permission");
  }

  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId,
  });
  if (scope.outOfScope) notFound();

  const branchId = scope.selectedBranchId;
  const [canCreateGrn, canCreateSupplier, supplierResult] = await Promise.all([
    probePermission(auth, PERMISSION_KEYS.PROCUREMENT_GRN_CREATE, branchId),
    probePermission(auth, PERMISSION_KEYS.PROCUREMENT_SUPPLIER_MANAGE),
    loadSuppliers(claims.tenant_id, supabase, branchId),
  ]);

  if (!canCreateGrn) {
    redirect("/access-denied?reason=insufficient-permission");
  }

  return {
    branchId,
    canCreateSupplier,
    suppliers: supplierResult.suppliers,
    suppliersLoadFailed: supplierResult.loadFailed,
  };
}
