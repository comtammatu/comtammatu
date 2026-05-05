"use server";

import { STAFF_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "./_lib/auth";

/* ─── Trust self-view (S15-min) ─── */

export type TrustScoreRow = {
  userId: string;
  fullName: string;
  branchId: number;
  score: number;
  /** Recomputed on-demand via compute_user_trust_score. */
  computedScore: number | null;
  grnCount30d: number;
  varianceIncidents30d: number;
  lastIncidentAt: string | null;
  updatedAt: string;
};

/**
 * Self-view: current user's trust score for a given branch.
 * No permission gate needed — users always see their own score.
 */
export async function getMyTrustScore(
  branchId: number,
): Promise<ActionResult<TrustScoreRow | null>> {
  if (!Number.isFinite(branchId) || branchId <= 0) {
    return { success: false, error: "Branch id không hợp lệ" };
  }

  // Pass STAFF_ROLES (not []) — getAuthContext rejects if role NOT in list.
  const ctx = await getAuthContext(STAFF_ROLES);
  if (!ctx) return { success: false, error: "Chưa đăng nhập" };
  const { supabase, user } = ctx;

  const { data, error } = await supabase
    .from("user_trust_score")
    .select(
      "user_id, branch_id, score, grn_count_30d, variance_incidents_30d, last_incident_at, updated_at, profiles!inner(full_name)",
    )
    .eq("branch_id", branchId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return { success: false, error: "Không đọc được trust score" };
  }
  if (!data) return { success: true, data: null };

  const raw = data as Record<string, unknown>;
  const prof = (raw.profiles ?? {}) as { full_name?: string };

  // Best-effort compute the live score too so the self-view reflects recent
  // GRN activity before the next updater cron.
  let computed: number | null = null;
  const { data: v } = await supabase.rpc("compute_user_trust_score", {
    p_user_id: user.id,
    p_branch_id: branchId,
  });
  if (v !== null && v !== undefined) computed = Number(v);

  return {
    success: true,
    data: {
      userId: String(raw.user_id ?? user.id),
      fullName: String(prof.full_name ?? ""),
      branchId,
      score: Number(raw.score ?? 50),
      computedScore: computed,
      grnCount30d: Number(raw.grn_count_30d ?? 0),
      varianceIncidents30d: Number(raw.variance_incidents_30d ?? 0),
      lastIncidentAt: (raw.last_incident_at ?? null) as string | null,
      updatedAt: String(raw.updated_at ?? ""),
    },
  };
}
