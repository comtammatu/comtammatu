import "server-only";

import { notFound } from "next/navigation";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermission } from "@/_lib/permissions";
import { getBranchSiteDisplayName } from "@/(protected)/inventory/_lib/branch-site-labels";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { loadInventoryMonetaryAccess } from "./monetary-access";
import type { PendingWasteRow } from "./waste-approval-model";

type LoadWasteApprovalsOptions = {
  routeBranchId?: number;
  queryBranchId?: string;
};

export async function loadWasteApprovalsData({
  routeBranchId,
  queryBranchId,
}: LoadWasteApprovalsOptions = {}) {
  const { supabase, claims, session } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranchId,
  });
  if (scope.outOfScope) notFound();

  const branchFilter = scope.selectedBranchId;
  const routeBranch =
    routeBranchId === undefined
      ? null
      : (scope.allowedBranches.find((branch) => branch.id === routeBranchId) ??
        null);
  const branchName = routeBranch
    ? getBranchSiteDisplayName(routeBranch)
    : routeBranchId === undefined
      ? null
      : `CN #${routeBranchId}`;
  const canApproveWaste =
    STAFF_ROLES.includes(claims.user_role) &&
    (await currentUserHasPermission(
      routeBranchId ?? null,
      PERMISSION_KEYS.INVENTORY_WASTE_APPROVE,
    ));
  const monetaryAccess = await loadInventoryMonetaryAccess(claims.user_role);
  const itemReadClient = monetaryAccess.valuation
    ? (monetaryAccess.client ?? supabase)
    : supabase;

  if (!canApproveWaste) {
    return {
      branchFilter,
      branchName,
      canApproveWaste,
      loadFailed: false,
      rows: [] as PendingWasteRow[],
    };
  }

  let query = supabase
    .from("stock_issues")
    .select(
      `
      id,
      issue_number,
      branch_id,
      issued_at,
      shift_key,
      source_type,
      created_by,
      notes
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("issue_type", "writeoff")
    .eq("approval_status", "pending")
    .order("issued_at", { ascending: true });

  if (branchFilter !== null) {
    query = query.eq("branch_id", branchFilter);
  }
  const { data: issues, error: issuesError } = await query;
  if (issuesError) {
    return {
      branchFilter,
      branchName,
      canApproveWaste,
      loadFailed: true,
      rows: [] as PendingWasteRow[],
    };
  }

  const issueIds = (issues ?? []).map((issue) => issue.id);
  const branchIds = Array.from(
    new Set((issues ?? []).map((issue) => issue.branch_id).filter(Boolean)),
  );
  const creatorIds = Array.from(
    new Set(
      (issues ?? [])
        .map((issue) => issue.created_by)
        .filter(Boolean) as string[],
    ),
  );
  const itemsQuery = monetaryAccess.valuation
    ? itemReadClient.from("stock_issue_items").select(`
        id,
        issue_id,
        ingredient_id,
        quantity,
        unit_cost,
        total_cost,
        reason_code,
        photo_urls,
        waste_tier,
        qty_ratio,
        rolling_15min_sum,
        ingredient:ingredients(id, name),
        unit_obj:units!stock_issue_items_entry_unit_id_fkey(code)
      `)
    : itemReadClient.from("stock_issue_items").select(`
        id,
        issue_id,
        ingredient_id,
        quantity,
        reason_code,
        photo_urls,
        ingredient:ingredients(id, name),
        unit_obj:units!stock_issue_items_entry_unit_id_fkey(code)
      `);
  const [itemsRes, branchesRes, creatorsRes] = await Promise.all([
    issueIds.length > 0
      ? itemsQuery.in("issue_id", issueIds)
      : Promise.resolve({ data: [] as never[], error: null }),
    branchIds.length > 0
      ? supabase.from("branches").select("id, name").in("id", branchIds)
      : Promise.resolve({ data: [] as never[], error: null }),
    creatorIds.length > 0
      ? supabase.from("profiles").select("id, full_name").in("id", creatorIds)
      : Promise.resolve({ data: [] as never[], error: null }),
  ]);

  if (itemsRes.error || branchesRes.error || creatorsRes.error) {
    return {
      branchFilter,
      branchName,
      canApproveWaste,
      loadFailed: true,
      rows: [] as PendingWasteRow[],
    };
  }

  const branchMap = new Map<number, string>();
  for (const branch of branchesRes.data ?? []) {
    branchMap.set(branch.id, branch.name);
  }
  const creatorMap = new Map<string, string>();
  for (const profile of creatorsRes.data ?? []) {
    if (profile.id) creatorMap.set(profile.id, profile.full_name ?? profile.id);
  }

  type ItemRow = NonNullable<typeof itemsRes.data>[number];
  type UnitCodeJoin = { code: string };
  type ItemRowWithUnit = ItemRow & {
    unit_obj?: UnitCodeJoin | UnitCodeJoin[] | null;
  };
  const itemsByIssue = new Map<number, ItemRow[]>();
  for (const item of (itemsRes.data ?? []) as ItemRow[]) {
    const items = itemsByIssue.get(item.issue_id) ?? [];
    items.push(item);
    itemsByIssue.set(item.issue_id, items);
  }

  const rows: PendingWasteRow[] = (issues ?? []).map((issue) => {
    const items = itemsByIssue.get(issue.id) ?? [];
    const totalValue = items.reduce(
      (sum, item) =>
        sum + Number("total_cost" in item ? item.total_cost ?? 0 : 0),
      0,
    );
    const creatorId = issue.created_by ?? "";

    return {
      issueId: issue.id,
      issueNumber: issue.issue_number,
      branchId: issue.branch_id,
      branchName: branchMap.get(issue.branch_id) ?? `CN #${issue.branch_id}`,
      issuedAt: issue.issued_at,
      shiftKey: issue.shift_key ?? "",
      sourceType: issue.source_type ?? "manual",
      createdBy: creatorId,
      createdByName: creatorMap.get(creatorId) ?? creatorId,
      isSelfCreated: creatorId === session.user.id,
      monetary: monetaryAccess.valuation ? { totalValue } : null,
      notes: issue.notes ?? null,
      items: items.map((item) => {
        const ingredient = Array.isArray(item.ingredient)
          ? item.ingredient[0]
          : item.ingredient;
        const itemWithUnit = item as ItemRowWithUnit;
        const unitObj = Array.isArray(itemWithUnit.unit_obj)
          ? itemWithUnit.unit_obj[0]
          : itemWithUnit.unit_obj;
        return {
          itemId: item.id,
          ingredientId: item.ingredient_id,
          ingredientName: ingredient?.name ?? `#${item.ingredient_id}`,
          quantity: Number(item.quantity),
          unit: unitObj?.code ?? "",
          monetary:
            monetaryAccess.valuation &&
            "unit_cost" in item &&
            "total_cost" in item
              ? {
                  unitCost:
                    item.unit_cost === null ? null : Number(item.unit_cost),
                  totalCost:
                    item.total_cost === null ? 0 : Number(item.total_cost),
                  qtyRatio:
                    "qty_ratio" in item && item.qty_ratio !== null
                      ? Number(item.qty_ratio)
                      : null,
                  rolling15MinSum:
                    "rolling_15min_sum" in item &&
                    item.rolling_15min_sum !== null
                      ? Number(item.rolling_15min_sum)
                      : null,
                }
              : null,
          reasonCode: item.reason_code ?? "",
          photoUrls: (item.photo_urls ?? []) as string[],
          wasteTier:
            monetaryAccess.valuation && "waste_tier" in item
              ? item.waste_tier
              : null,
        };
      }),
    };
  });

  return {
    branchFilter,
    branchName,
    canApproveWaste,
    loadFailed: false,
    rows,
  };
}

export async function loadBranchWasteApprovalsData(routeBranchId: number) {
  return loadWasteApprovalsData({ routeBranchId });
}
