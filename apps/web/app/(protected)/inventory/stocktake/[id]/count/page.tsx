import { notFound, redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import { parseBranchIdParam } from "../../../_lib/inventory-scope";
import { getStocktakeLinesBlind } from "../../../stocktake-actions";
import type { CountUnitOption } from "../../../_lib/count-units";
import { parseStocktakeDraftCounts } from "@lib/inventory/stocktake-model";
import { StocktakeCountClient } from "./count-client";
import { INVENTORY_VI } from "@comtammatu/shared/messages";

interface StocktakeCountPageContentProps {
  stocktakeId: number;
  searchParams?: Promise<{ branch?: string | string[] }>;
  routeBranchId?: number;
  routeBase?: string;
}

async function StocktakeCountPageContent({
  stocktakeId,
  searchParams,
  routeBranchId,
  routeBase = "/inventory/stocktake",
}: StocktakeCountPageContentProps) {
  const sessionId = stocktakeId;
  if (!Number.isFinite(sessionId) || sessionId <= 0) notFound();

  const supabase = await createClient();
  const { data: sessionRow } = await supabase
    .from("stocktake_sessions")
    .select(
      "id, tenant_id, branch_id, session_number, status, blind_mode, started_at, completed_at",
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (!sessionRow) notFound();
  const sessionBranchId = sessionRow.branch_id as number;
  const sp = searchParams ? await searchParams : {};
  const requestedBranchId = routeBranchId ?? parseBranchIdParam(sp.branch);
  if (routeBranchId != null && routeBranchId !== sessionBranchId) {
    notFound();
  }
  if (requestedBranchId !== sessionBranchId) {
    redirect(`${routeBase}/${sessionId}/count?branch=${sessionBranchId}`);
  }

  const linesRes = await getStocktakeLinesBlind(sessionId);
  if (!linesRes.success || !linesRes.data) notFound();

  const currentRound =
    linesRes.data.reduce((max, l) => (l.roundNo > max ? l.roundNo : max), 1) ||
    1;
  const { data: draftRow } = await supabase
    .from("stocktake_drafts")
    .select("draft_counts")
    .eq("session_id", sessionId)
    .maybeSingle();
  const initialDraftCounts = parseStocktakeDraftCounts(
    draftRow?.draft_counts,
    currentRound,
  );

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
        "id, ingredient_units!ingredient_units_ingredient_tenant_fkey(unit_id, to_base_factor, is_base, sort_order, units!ingredient_units_unit_tenant_fkey(code, name))",
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
          label: u.units?.name ?? u.units?.code ?? "",
          isBase: u.is_base,
          toBaseFactor: Number(u.to_base_factor ?? 0),
        }));
    }
  }

  return (
    <StocktakeCountClient
      sessionId={sessionId}
      sessionNumber={
        sessionRow.session_number?.trim() || INVENTORY_VI.documentNumberPending
      }
      branchId={sessionBranchId}
      status={sessionRow.status as string}
      blindMode={Boolean(sessionRow.blind_mode)}
      currentRound={Math.min(4, currentRound) as 1 | 2 | 3 | 4}
      initialLines={linesRes.data}
      initialDraftCounts={initialDraftCounts}
      unitOptionsByIngredient={unitOptionsByIngredient}
      routeBase={routeBase}
    />
  );
}

export default async function StocktakeCountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ branch?: string | string[] }>;
}) {
  const { id } = await params;
  return (
    <StocktakeCountPageContent
      stocktakeId={Number(id)}
      searchParams={searchParams}
    />
  );
}
