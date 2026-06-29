import { notFound, redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  INVENTORY_FEATURE_FLAGS,
  isFeatureEnabledForBranch,
} from "../../../_lib/feature-flags";
import { resolveRequestedBranchId } from "../../../_lib/inventory-scope";
import { getStocktakeLinesBlind } from "../../../stocktake-actions";
import type { CountUnitOption } from "../../../_lib/count-units";
import { StocktakeCountClient } from "./count-client";

export const dynamic = "force-dynamic";

export default async function StocktakeCountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ branchId?: string | string[] }>;
}) {
  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isFinite(sessionId) || sessionId <= 0) notFound();

  const supabase = await createClient();
  const { data: sessionRow } = await supabase
    .from("stocktake_sessions")
    .select("id, tenant_id, branch_id, status, started_at, completed_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (!sessionRow) notFound();
  const sessionBranchId = sessionRow.branch_id as number;
  const sp = await searchParams;
  const requestedBranchId = await resolveRequestedBranchId(sp.branchId);
  if (requestedBranchId !== sessionBranchId) {
    redirect(
      `/inventory/stocktake/${sessionId}/count?branchId=${sessionBranchId}`,
    );
  }

  // Feature flag gate — route the counter to the pre-redesign detail screen when the flag is off.
  const flagEnabled = await isFeatureEnabledForBranch(
    supabase,
    sessionBranchId,
    INVENTORY_FEATURE_FLAGS.INVENTORY_STOCKTAKE_REDESIGNED,
  );
  if (!flagEnabled) {
    redirect(
      `/inventory/stocktake/${sessionId}?branchId=${sessionBranchId}&error=stocktake_redesigned_not_enabled`,
    );
  }

  const linesRes = await getStocktakeLinesBlind(sessionId);
  if (!linesRes.success || !linesRes.data) notFound();

  const currentRound =
    linesRes.data.reduce((max, l) => (l.roundNo > max ? l.roundNo : max), 1) ||
    1;

  // The blind line RPC returns only a unit string, so fetch the active units
  // per ingredient separately to build the counting-unit dropdowns.
  const ingredientIds = [
    ...new Set(linesRes.data.map((line) => line.ingredientId)),
  ];
  const unitOptionsByIngredient: Record<number, CountUnitOption[]> = {};
  if (ingredientIds.length > 0) {
    const { data: unitRows } = await supabase
      .from("ingredients")
      .select(
        "id, ingredient_units(unit_id, is_base, sort_order, units(code))",
      )
      .eq("tenant_id", sessionRow.tenant_id)
      .in("id", ingredientIds);

    // Counting can use any of the ingredient's units (no role filter), base first.
    for (const row of unitRows ?? []) {
      unitOptionsByIngredient[row.id] = (row.ingredient_units ?? [])
        .filter((u) => (u.units?.code ?? "") !== "")
        .sort((a, b) => {
          if (a.is_base !== b.is_base) return a.is_base ? -1 : 1;
          return a.sort_order - b.sort_order;
        })
        .map((u) => ({
          unitId: u.unit_id,
          code: u.units?.code ?? "",
          isBase: u.is_base,
        }));
    }
  }

  return (
    <StocktakeCountClient
      sessionId={sessionId}
      branchId={sessionBranchId}
      status={sessionRow.status as string}
      currentRound={Math.min(4, currentRound) as 1 | 2 | 3 | 4}
      initialLines={linesRes.data}
      unitOptionsByIngredient={unitOptionsByIngredient}
    />
  );
}
