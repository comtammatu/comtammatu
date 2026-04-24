import { notFound, redirect } from "next/navigation";
import { createClient } from "@comtammatu/database/supabase/server";
import {
  INVENTORY_FEATURE_FLAGS,
  isFeatureEnabledForBranch,
} from "../../../_lib/feature-flags";
import { getStocktakeLinesBlind } from "../../../stocktake-actions";
import { EscalateClient } from "./escalate-client";

export const dynamic = "force-dynamic";

export default async function StocktakeEscalatePage({
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
    .select("id, branch_id, status, current_round, started_at, completed_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (!sessionRow) notFound();

  // Gate: S13b (recount / escalation) must be enabled for this branch.
  const flagEnabled = await isFeatureEnabledForBranch(
    supabase,
    sessionRow.branch_id as number,
    INVENTORY_FEATURE_FLAGS.S13B_STOCKTAKE_RECOUNT,
  );
  if (!flagEnabled) {
    redirect(`/inventory/stocktake/${sessionId}?error=stocktake_recount_not_enabled`);
  }

  const linesRes = await getStocktakeLinesBlind(sessionId);
  if (!linesRes.success || !linesRes.data) notFound();

  return (
    <EscalateClient
      sessionId={sessionId}
      branchId={sessionRow.branch_id as number}
      status={sessionRow.status as string}
      currentRound={Number(sessionRow.current_round ?? 1) as 1 | 2 | 3 | 4}
      lines={linesRes.data}
    />
  );
}
