"use server";

import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext, getAuthContextWithPermission } from "./_lib/auth";

/* ─── Trust leaderboard + self-view (S15-min) ─── */

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
 * Fetch trust-score rows for a branch, ranked by stored score DESC.
 * Permission: `reports:view_branch` (QLV+) to cover the snapshot view.
 * The caller can pass an explicit branchId; otherwise the function
 * requires the caller to specify scope upstream (no silent "all").
 */
export async function getTrustLeaderboard(
  branchId: number,
  opts?: { limit?: number; includeComputed?: boolean },
): Promise<ActionResult<TrustScoreRow[]>> {
  if (!Number.isFinite(branchId) || branchId <= 0) {
    return { success: false, error: "Branch id không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.REPORTS_VIEW_BRANCH,
  );
  if (!ctx) return { success: false, error: "Không có quyền xem trust score" };
  const { supabase } = ctx;

  const limit = Math.max(1, Math.min(opts?.limit ?? 100, 500));
  const { data, error } = await supabase
    .from("user_trust_score")
    .select(
      "user_id, branch_id, score, grn_count_30d, variance_incidents_30d, last_incident_at, updated_at, profiles!inner(full_name)",
    )
    .eq("branch_id", branchId)
    .order("score", { ascending: false })
    .limit(limit);

  if (error) {
    return { success: false, error: "Không tải được trust leaderboard" };
  }

  const rows: TrustScoreRow[] = (data ?? []).map((r) => {
    const raw = r as Record<string, unknown>;
    const prof = (raw.profiles ?? {}) as { full_name?: string };
    return {
      userId: String(raw.user_id ?? ""),
      fullName: String(prof.full_name ?? ""),
      branchId: Number(raw.branch_id ?? 0),
      score: Number(raw.score ?? 50),
      computedScore: null,
      grnCount30d: Number(raw.grn_count_30d ?? 0),
      varianceIncidents30d: Number(raw.variance_incidents_30d ?? 0),
      lastIncidentAt: (raw.last_incident_at ?? null) as string | null,
      updatedAt: String(raw.updated_at ?? ""),
    };
  });

  // Optional: refresh computed score via RPC for the top rows. Cheap enough
  // for a snapshot view; caller disables it to keep loads light.
  if (opts?.includeComputed && rows.length > 0) {
    const topN = Math.min(rows.length, 25);
    for (let i = 0; i < topN; i += 1) {
      const row = rows[i];
      if (!row) continue;
      const { data: v } = await supabase.rpc("compute_user_trust_score", {
        p_user_id: row.userId,
        p_branch_id: row.branchId,
      });
      row.computedScore = v === null || v === undefined ? null : Number(v);
    }
  }

  return { success: true, data: rows };
}

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
