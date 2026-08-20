import "server-only";

import { notFound } from "next/navigation";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import { currentUserHasPermission } from "@/_lib/permissions";
import { loadAuthState } from "@/_lib/auth";
import { resolveProfileDisplayNames } from "@/_lib/profile-display-names";
import { STAFF_VI } from "@comtammatu/shared/messages";
import {
  resolveInventoryBranchScope,
  resolveInventoryListScope,
} from "@/(protected)/inventory/_lib/inventory-scope";
import { getBranchSiteDisplayName } from "@/(protected)/inventory/_lib/branch-site-labels";
import {
  fetchStocktakeDetail,
  fetchStocktakeSessions,
} from "@/(protected)/inventory/actions";
import { getStocktakeLinesBlind } from "@/(protected)/inventory/stocktake-actions";
import type {
  BranchStocktakeCountData,
  BranchStocktakeCountLine,
  BranchStocktakeCountUnit,
  BranchStocktakeDetail,
  BranchStocktakeLine,
  BranchStocktakeLocation,
  BranchStocktakeSession,
  BranchStocktakeStatus,
} from "./stocktake-model";

type SessionListRow = {
  id: number;
  session_number?: string | null;
  branch_id: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  created_by: string;
  status: string;
  notes: string | null;
  total_items?: number | null;
  counted_items?: number | null;
};

type StocktakeDetailRow = {
  session: {
    id: number;
    branch_id: number;
    started_at: string | null;
    completed_at: string | null;
    created_at: string;
    created_by: string;
    status: string;
    blind_mode: boolean | null;
    current_round: number | null;
    notes: string | null;
  };
  lines: Array<{
    id: number;
    ingredient_id: number;
    system_quantity: number | null;
    counted_quantity: number | null;
    variance: number | null;
    variance_reason: string | null;
    needs_recount?: boolean | null;
    ingredients: {
      id: number;
      name: string;
      unit: string;
    } | null;
  }>;
};

type StocktakeSessionRow = {
  id: number;
  session_number?: string | null;
  branch_id: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  created_by: string;
  status: string;
  blind_mode: boolean | null;
  current_round: number | null;
  notes: string | null;
};

function toSessionNumber(
  row: Pick<StocktakeSessionRow, "id" | "session_number">,
): string {
  return row.session_number?.trim() || `KK-${row.id}`;
}

type UnitRow = {
  id: number;
  ingredient_units: Array<{
    unit_id: number;
    to_base_factor: number | null;
    is_base: boolean;
    sort_order: number;
    units: { code: string | null; name: string | null } | null;
  }> | null;
};

function toStatus(value: string): BranchStocktakeStatus {
  if (value === "completed" || value === "cancelled") return value;
  return "in_progress";
}

function toBranchStocktakeSession(
  row: SessionListRow,
  createdByName: string,
): BranchStocktakeSession {
  return {
    id: row.id,
    sessionNumber: toSessionNumber(row),
    branchId: row.branch_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    createdBy: row.created_by,
    createdByName,
    status: toStatus(row.status),
    notes: row.notes,
    totalItems: Number(row.total_items ?? 0),
    countedItems: Number(row.counted_items ?? 0),
  };
}

export async function loadBranchStocktakeListData(routeBranchId: number) {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
  });
  if (scope.outOfScope || scope.selectedBranchId !== routeBranchId) notFound();

  const [sessionsResult, canManage] = await Promise.all([
    fetchStocktakeSessions(routeBranchId),
    currentUserHasPermission(
      routeBranchId,
      PERMISSION_KEYS.INVENTORY_STOCKTAKE_CREATE,
    ),
  ]);
  const branch = scope.allowedBranches.find(
    (item) => item.id === routeBranchId,
  );

  const sessions = sessionsResult.success
    ? ((sessionsResult.data ?? []) as SessionListRow[])
    : [];
  const createdByNames = await resolveProfileDisplayNames(
    supabase,
    sessions.map((row) => row.created_by),
  );

  return {
    branchId: routeBranchId,
    branchName: branch
      ? getBranchSiteDisplayName(branch)
      : `CN #${routeBranchId}`,
    canManage,
    sessions: sessions.map((row) =>
      toBranchStocktakeSession(
        row,
        createdByNames.get(row.created_by) ?? STAFF_VI.long,
      ),
    ),
  };
}

export async function loadBranchStocktakeStartData(routeBranchId: number) {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryListScope(supabase, claims, {
    routeBranchId,
  });
  if (scope.outOfScope || scope.selectedBranchId !== routeBranchId) notFound();

  const [canManage, locationsResult] = await Promise.all([
    currentUserHasPermission(
      routeBranchId,
      PERMISSION_KEYS.INVENTORY_STOCKTAKE_CREATE,
    ),
    supabase
      .from("inventory_locations")
      .select("id, name, location_kind")
      .eq("tenant_id", claims.tenant_id)
      .eq("branch_id", routeBranchId)
      .eq("is_active", true)
      .eq("location_kind", "warehouse")
      .order("name"),
  ]);
  const branch = scope.allowedBranches.find(
    (item) => item.id === routeBranchId,
  );
  const locations: BranchStocktakeLocation[] = (locationsResult.data ?? []).map(
    (location) => ({
      id: location.id,
      name: location.name,
      kind: location.location_kind,
    }),
  );

  return {
    branchId: routeBranchId,
    branchName: branch
      ? getBranchSiteDisplayName(branch)
      : `CN #${routeBranchId}`,
    canManage,
    locations,
  };
}

export async function loadBranchStocktakeDetailData(
  stocktakeId: number,
  routeBranchId: number,
): Promise<BranchStocktakeDetail> {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryBranchScope(
    supabase,
    claims,
    routeBranchId,
  );
  if (scope.selectedBranchId !== routeBranchId) notFound();

  const { data: sessionRow } = await supabase
    .from("stocktake_sessions")
    .select(
      "id, session_number, branch_id, started_at, completed_at, created_at, created_by, status, blind_mode, current_round, notes",
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("id", stocktakeId)
    .maybeSingle();
  if (!sessionRow || sessionRow.branch_id !== routeBranchId) notFound();

  const session = sessionRow as StocktakeSessionRow;
  const status = toStatus(session.status);
  const [canCancel, canComplete] = await Promise.all([
    currentUserHasPermission(
      routeBranchId,
      PERMISSION_KEYS.INVENTORY_STOCKTAKE_CREATE,
    ),
    currentUserHasPermission(
      routeBranchId,
      PERMISSION_KEYS.INVENTORY_STOCKTAKE_COMPLETE,
    ),
  ]);

  let lines: BranchStocktakeLine[] = [];
  if (status === "in_progress") {
    const blindLines = await getStocktakeLinesBlind(stocktakeId);
    if (!blindLines.success || !blindLines.data) notFound();
    lines = (blindLines.data as BranchStocktakeCountLine[]).map((line) => ({
      id: line.lineId,
      ingredientId: line.ingredientId,
      ingredientName: line.ingredientName,
      unit: line.unit,
      countedQuantity: line.countedQuantity,
      varianceReason: null,
      needsRecount: line.needsRecount,
      systemQuantity: null,
      variance: null,
    }));
  } else if (status === "completed") {
    const result = await fetchStocktakeDetail(stocktakeId);
    if (!result.success || !result.data) notFound();
    const raw = result.data as StocktakeDetailRow;
    lines = raw.lines.map((line) => ({
      id: line.id,
      ingredientId: line.ingredient_id,
      ingredientName: line.ingredients?.name ?? `#${line.ingredient_id}`,
      unit: line.ingredients?.unit ?? "",
      countedQuantity:
        line.counted_quantity === null ? null : Number(line.counted_quantity),
      varianceReason: line.variance_reason,
      needsRecount: line.needs_recount === true,
      systemQuantity:
        line.system_quantity === null ? null : Number(line.system_quantity),
      variance: line.variance === null ? null : Number(line.variance),
    }));
  }

  const names = await resolveProfileDisplayNames(supabase, [
    session.created_by,
  ]);

  return {
    session: {
      id: session.id,
      sessionNumber: toSessionNumber(session),
      branchId: session.branch_id,
      startedAt: session.started_at,
      completedAt: session.completed_at,
      createdAt: session.created_at,
      createdBy: session.created_by,
      createdByName: names.get(session.created_by) ?? STAFF_VI.long,
      status,
      notes: session.notes,
      blindMode: session.blind_mode === true,
      currentRound: Number(session.current_round ?? 1),
    },
    lines,
    canCancel,
    canComplete,
  };
}

export async function loadBranchStocktakeCountData(
  stocktakeId: number,
  routeBranchId: number,
): Promise<BranchStocktakeCountData> {
  const { supabase, claims } = await loadAuthState();
  const scope = await resolveInventoryBranchScope(
    supabase,
    claims,
    routeBranchId,
  );
  if (scope.selectedBranchId !== routeBranchId) notFound();

  const { data: sessionRow } = await supabase
    .from("stocktake_sessions")
    .select("id, session_number, tenant_id, branch_id, status, blind_mode")
    .eq("tenant_id", claims.tenant_id)
    .eq("id", stocktakeId)
    .maybeSingle();
  if (!sessionRow || sessionRow.branch_id !== routeBranchId) notFound();

  const linesResult = await getStocktakeLinesBlind(stocktakeId);
  if (!linesResult.success || !linesResult.data) notFound();

  const lines = linesResult.data as BranchStocktakeCountLine[];
  const currentRound =
    lines.reduce((max, line) => Math.max(max, line.roundNo), 1) || 1;
  const ingredientIds = [...new Set(lines.map((line) => line.ingredientId))];
  const unitOptionsByIngredient: Record<number, BranchStocktakeCountUnit[]> =
    {};

  if (ingredientIds.length > 0) {
    const { data: unitRows } = await supabase
      .from("ingredients")
      .select(
        "id, ingredient_units!ingredient_units_ingredient_tenant_fkey(unit_id, to_base_factor, is_base, sort_order, units!ingredient_units_unit_tenant_fkey(code, name))",
      )
      .eq("tenant_id", claims.tenant_id)
      .in("id", ingredientIds);

    for (const row of (unitRows ?? []) as unknown as UnitRow[]) {
      unitOptionsByIngredient[row.id] = (row.ingredient_units ?? [])
        .filter((unit) => (unit.units?.code ?? "") !== "")
        .sort((left, right) => {
          if (left.is_base !== right.is_base) return left.is_base ? -1 : 1;
          return left.sort_order - right.sort_order;
        })
        .map((unit) => ({
          unitId: unit.unit_id,
          code: unit.units?.code ?? "",
          label: unit.units?.name ?? unit.units?.code ?? "",
          isBase: unit.is_base,
          toBaseFactor: Number(unit.to_base_factor ?? 0),
        }));
    }
  }

  return {
    sessionId: stocktakeId,
    sessionNumber: toSessionNumber(sessionRow),
    branchId: routeBranchId,
    status: toStatus(sessionRow.status),
    blindMode: sessionRow.blind_mode === true,
    currentRound: Math.min(4, currentRound) as 1 | 2 | 3 | 4,
    lines,
    unitOptionsByIngredient,
  };
}
