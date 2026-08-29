import "server-only";

import { notFound } from "next/navigation";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import { loadAuthState } from "@/_lib/auth";
import { currentUserHasPermission } from "@/_lib/permissions";
import { getBranchSiteDisplayName } from "@/(protected)/inventory/_lib/branch-site-labels";
import { resolveInventoryListScope } from "@/(protected)/inventory/_lib/inventory-scope";
import { computeIssueLineTotal } from "@/(protected)/inventory/_lib/issue-units";
import {
  getEmbeddedIngredientBaseUnitDisplayName,
  getEmbeddedUnitDisplayName,
} from "@/(protected)/inventory/_lib/unit-display";
import { loadInventoryMonetaryAccess } from "./monetary-access";
import type { PendingWasteRow } from "./waste-approval-model";
import { resolveProfileDisplayNames } from "@/_lib/profile-display-names";
import { STAFF_VI } from "@comtammatu/shared/messages";

type LoadWasteApprovalsOptions = {
  routeBranchId?: number;
  queryBranch?: string | string[];
};

export async function loadWasteApprovalsData({
  routeBranchId,
  queryBranch,
}: LoadWasteApprovalsOptions = {}) {
  const { supabase, claims, userId: currentUserId } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
    queryBranch,
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
  const isOwner = claims.user_role === "owner";
  const canBypassSelfApproval =
    isOwner ||
    (await currentUserHasPermission(
      null,
      PERMISSION_KEYS.ACCOUNTING_PERIOD_REOPEN,
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
  const ingredientUnitsSelect =
    "ingredient_units!ingredient_units_ingredient_tenant_fkey(unit_id, to_base_factor, is_base, units!ingredient_units_unit_tenant_fkey(code, name))";
  const itemsQuery = monetaryAccess.valuation
    ? itemReadClient.from("stock_issue_items").select(`
        id,
        issue_id,
        ingredient_id,
        quantity,
        entry_unit_id,
        unit_cost,
        total_cost,
        reason_code,
        photo_urls,
        waste_tier,
        qty_ratio,
        rolling_15min_sum,
        ingredient:ingredients(id, name, ${ingredientUnitsSelect}),
        unit_obj:units!stock_issue_items_entry_unit_id_fkey(code, name)
      `)
    : itemReadClient.from("stock_issue_items").select(`
        id,
        issue_id,
        ingredient_id,
        quantity,
        entry_unit_id,
        reason_code,
        photo_urls,
        ingredient:ingredients(id, name, ${ingredientUnitsSelect}),
        unit_obj:units!stock_issue_items_entry_unit_id_fkey(code, name)
      `);
  const [itemsRes, branchesRes, creatorsRes] = await Promise.all([
    issueIds.length > 0
      ? itemsQuery.in("issue_id", issueIds)
      : Promise.resolve({ data: [] as never[], error: null }),
    branchIds.length > 0
      ? supabase.from("branches").select("id, name").in("id", branchIds)
      : Promise.resolve({ data: [] as never[], error: null }),
    creatorIds.length > 0
      ? resolveProfileDisplayNames(supabase, creatorIds).then((data) => ({
          data,
          error: null,
        }))
      : Promise.resolve({
          data: new Map<string, string>(),
          error: null,
        }),
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
  const creatorMap = creatorsRes.data;

  type ItemRow = NonNullable<typeof itemsRes.data>[number];
  type IngredientUnitJoin = {
    unit_id: number;
    to_base_factor: number | string;
    is_base: boolean;
    units?: unknown;
  };
  type IngredientJoin = {
    id: number;
    name: string;
    ingredient_units?: IngredientUnitJoin[] | null;
  };
  type UnitJoin = { code: string; name?: string | null };
  type ItemRowWithJoins = ItemRow & {
    unit_obj?: UnitJoin | UnitJoin[] | null;
    ingredient?: IngredientJoin | IngredientJoin[] | null;
  };
  const itemsByIssue = new Map<number, ItemRowWithJoins[]>();
  for (const item of (itemsRes.data ?? []) as ItemRowWithJoins[]) {
    const items = itemsByIssue.get(item.issue_id) ?? [];
    items.push(item);
    itemsByIssue.set(item.issue_id, items);
  }

  const rows: PendingWasteRow[] = (issues ?? []).map((issue) => {
    const items = itemsByIssue.get(issue.id) ?? [];
    const mappedItems = items.map((item) => {
      const ingredient = Array.isArray(item.ingredient)
        ? (item.ingredient[0] ?? null)
        : (item.ingredient ?? null);
      const unitObj = Array.isArray(item.unit_obj)
        ? (item.unit_obj[0] ?? null)
        : (item.unit_obj ?? null);
      const entryUnitId =
        item.entry_unit_id == null ? null : Number(item.entry_unit_id);
      const ingredientUnits = Array.isArray(ingredient?.ingredient_units)
        ? ingredient.ingredient_units
        : [];
      const entryUnitRow =
        entryUnitId == null
          ? null
          : (ingredientUnits.find(
              (row) => Number(row.unit_id) === entryUnitId,
            ) ?? null);
      const baseUnitRow =
        ingredientUnits.find((row) => row.is_base === true) ?? null;
      const toBaseFactorRaw = Number(entryUnitRow?.to_base_factor ?? 1);
      const toBaseFactor =
        Number.isFinite(toBaseFactorRaw) && toBaseFactorRaw > 0
          ? toBaseFactorRaw
          : 1;
      const unit =
        getEmbeddedUnitDisplayName(unitObj) ??
        getEmbeddedIngredientBaseUnitDisplayName(ingredient) ??
        "";
      const baseUnit =
        getEmbeddedUnitDisplayName(baseUnitRow?.units) ??
        getEmbeddedIngredientBaseUnitDisplayName(ingredient) ??
        unit;
      const entryQuantity = Number(item.quantity);
      const unitCost =
        monetaryAccess.valuation && "unit_cost" in item
          ? item.unit_cost === null
            ? null
            : Number(item.unit_cost)
          : null;
      const correctedTotal =
        unitCost == null
          ? 0
          : computeIssueLineTotal({
              entryQuantity,
              baseUnitCost: unitCost,
              toBaseFactor,
            }).total;

      return {
        itemId: item.id,
        ingredientId: item.ingredient_id,
        ingredientName: ingredient?.name ?? `#${item.ingredient_id}`,
        quantity: entryQuantity,
        unit,
        baseUnit,
        toBaseFactor,
        monetary:
          monetaryAccess.valuation && unitCost != null
            ? {
                unitCost,
                totalCost: correctedTotal,
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
    });
    const totalValue = mappedItems.reduce(
      (sum, item) => sum + (item.monetary?.totalCost ?? 0),
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
      createdByName: creatorMap.get(creatorId) ?? STAFF_VI.long,
      isSelfCreated: creatorId === currentUserId,
      canBypassSelfApproval,
      monetary: monetaryAccess.valuation ? { totalValue } : null,
      notes: issue.notes ?? null,
      items: mappedItems,
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
