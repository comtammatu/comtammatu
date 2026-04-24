import { notFound, redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  INVENTORY_FEATURE_FLAGS,
  isFeatureEnabledForBranch,
} from "../../../_lib/feature-flags";
import { getStocktakeLinesBlind } from "../../../stocktake-actions";
import { StocktakeCountClient } from "./count-client";

export const dynamic = "force-dynamic";

export default async function StocktakeCountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessionId = Number(id);
  if (!Number.isFinite(sessionId) || sessionId <= 0) notFound();

  const supabase = await createClient();
  const { data: sessionRow } = await supabase
    .from("stocktake_sessions")
    .select("id, branch_id, status, started_at, completed_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (!sessionRow) notFound();

  // Feature flag gate — route the counter to legacy detail when S13a is off.
  const flagEnabled = await isFeatureEnabledForBranch(
    supabase,
    sessionRow.branch_id as number,
    INVENTORY_FEATURE_FLAGS.S13A_STOCKTAKE_V2,
  );
  if (!flagEnabled) {
    redirect(`/inventory/stocktake/${sessionId}?error=stocktake_v2_not_enabled`);
  }

  const linesRes = await getStocktakeLinesBlind(sessionId);
  if (!linesRes.success || !linesRes.data) notFound();

  const currentRound =
    linesRes.data.reduce(
      (max, l) => (l.roundNo > max ? l.roundNo : max),
      1,
    ) || 1;

  return (
    <StocktakeCountClient
      sessionId={sessionId}
      branchId={sessionRow.branch_id as number}
      status={sessionRow.status as string}
      currentRound={Math.min(4, currentRound) as 1 | 2 | 3 | 4}
      initialLines={linesRes.data}
    />
  );
}
