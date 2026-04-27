"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "./_lib/auth";

/* ─── Start stocktake (S13a) ─── */

const STOCKTAKE_MODES = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "spot",
] as const;

const startStocktakeSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  locationId: z.coerce.number().int().positive().optional(),
  mode: z.enum(STOCKTAKE_MODES),
  blindMode: z.boolean().optional(),
  thresholdPct: z.coerce.number().min(0).max(100).optional(),
  thresholdVnd: z.coerce.number().min(0).optional(),
});

export type StocktakeStartResult = {
  sessionId: number;
  mode: string;
  blindMode: boolean;
  isUnaudited: boolean;
  seededLines: number;
  abcSnapshotAt: string;
};

/**
 * Start a new stocktake session. Wraps `start_stocktake` RPC.
 * Server seeds round-1 lines from stock_levels snapshot + ABC class.
 * Blind mode default per mode unless explicit override.
 */
export async function startStocktake(
  input: z.infer<typeof startStocktakeSchema>,
): Promise<ActionResult<StocktakeStartResult>> {
  const parsed = startStocktakeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Input không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_STOCKTAKE_CREATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền tạo stocktake" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("start_stocktake", {
    p_branch_id: parsed.data.branchId,
    p_location_id: parsed.data.locationId ?? undefined,
    p_mode: parsed.data.mode,
    p_blind_mode: parsed.data.blindMode ?? undefined,
    p_threshold_pct: parsed.data.thresholdPct ?? undefined,
    p_threshold_vnd: parsed.data.thresholdVnd ?? undefined,
  });

  if (error || !data) {
    return { success: false, error: "Không tạo được stocktake session" };
  }

  const raw = data as Record<string, unknown>;
  revalidatePath("/inventory/stocktake");

  return {
    success: true,
    data: {
      sessionId: Number(raw.session_id ?? 0),
      mode: String(raw.mode ?? parsed.data.mode),
      blindMode: Boolean(raw.blind_mode),
      isUnaudited: Boolean(raw.is_unaudited),
      seededLines: Number(raw.seeded_lines ?? 0),
      abcSnapshotAt: String(raw.abc_snapshot_at ?? new Date().toISOString()),
    },
  };
}

/* ─── Blind line fetcher (S13a) ─── */

export type StocktakeLineBlind = {
  lineId: number;
  ingredientId: number;
  ingredientName: string;
  unit: string;
  abcClass: "A" | "B" | "C" | null;
  roundNo: number;
  countedQuantity: number | null;
  countedBy: string | null;
  countedAt: string | null;
  needsRecount: boolean;
  isFinal: boolean;
};

/**
 * Fetch stocktake lines WITHOUT system_quantity (blind mode).
 * Wraps `get_stocktake_lines_blind` RPC — SECURITY DEFINER strips
 * system_qty server-side regardless of caller's RLS.
 */
export async function getStocktakeLinesBlind(
  sessionId: number,
): Promise<ActionResult<StocktakeLineBlind[]>> {
  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_STOCKTAKE_CREATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("get_stocktake_lines_blind", {
    p_session_id: sessionId,
  });

  if (error || !data) {
    return { success: false, error: "Không tải được danh sách dòng đếm" };
  }

  const rows = (data as unknown[]).map((r) => {
    const raw = r as Record<string, unknown>;
    return {
      lineId: Number(raw.line_id ?? 0),
      ingredientId: Number(raw.ingredient_id ?? 0),
      ingredientName: String(raw.ingredient_name ?? ""),
      unit: String(raw.unit ?? ""),
      abcClass: (raw.abc_class ?? null) as "A" | "B" | "C" | null,
      roundNo: Number(raw.round_no ?? 1),
      countedQuantity:
        raw.counted_quantity === null || raw.counted_quantity === undefined
          ? null
          : Number(raw.counted_quantity),
      countedBy: (raw.counted_by ?? null) as string | null,
      countedAt: (raw.counted_at ?? null) as string | null,
      needsRecount: Boolean(raw.needs_recount),
      isFinal: Boolean(raw.is_final),
    };
  });

  return { success: true, data: rows };
}

/* ─── Submit count round (S13a) ─── */

const submitCountSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
  roundNo: z.coerce.number().int().min(1).max(4),
  counts: z
    .array(
      z.object({
        ingredient_id: z.coerce.number().int().positive(),
        counted_quantity: z.coerce.number().min(0),
        client_op_id: z.string().uuid().optional(),
        offline_created_at: z.string().optional(),
      }),
    )
    .min(1)
    .max(500),
});

export async function submitCountRound(
  input: z.infer<typeof submitCountSchema>,
): Promise<ActionResult<{ appliedCount: number; conflictCount: number; roundNo: number }>> {
  const parsed = submitCountSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Input không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_STOCKTAKE_CREATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("submit_count_round", {
    p_session_id: parsed.data.sessionId,
    p_round_no: parsed.data.roundNo,
    p_counts: parsed.data.counts,
  });

  if (error) {
    if (error.code === "42501") {
      return { success: false, error: "Không có quyền hoặc kỳ đã đóng" };
    }
    return { success: false, error: "Không submit được vòng đếm." };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  revalidatePath(`/inventory/stocktake/${parsed.data.sessionId}`);

  return {
    success: true,
    data: {
      appliedCount: Number(raw.applied_count ?? 0),
      conflictCount: Number(raw.conflict_count ?? 0),
      roundNo: Number(raw.round_no ?? parsed.data.roundNo),
    },
  };
}

/* ─── Draft auto-save (S13a) ─── */

const saveDraftSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
  draftCounts: z.record(z.string(), z.unknown()),
});

/**
 * Auto-save counter's in-progress counts to `stocktake_drafts`.
 * Debounced 30s from client. Cleared on session finalize (CASCADE).
 *
 * Stored shape: `{ [ingredient_id]: { qty: number, note?: string, savedAt: ISO } }`.
 */
export async function saveStocktakeDraft(
  input: z.infer<typeof saveDraftSchema>,
): Promise<ActionResult<{ lastSavedAt: string }>> {
  const parsed = saveDraftSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Input không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_STOCKTAKE_CREATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, user } = ctx;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("stocktake_drafts")
    .upsert(
      {
        session_id: parsed.data.sessionId,
        // Generated types narrow draft_counts to Json; Record<string, unknown>
        // is functionally equivalent but not assignable. JSON.parse/stringify
        // round-trip keeps the runtime value identical and satisfies the type.
        draft_counts: JSON.parse(
          JSON.stringify(parsed.data.draftCounts),
        ) as Record<string, never>,
        last_saved_at: now,
        saved_by: user.id,
      },
      { onConflict: "session_id" },
    );

  if (error) {
    return { success: false, error: "Không lưu draft được" };
  }

  return { success: true, data: { lastSavedAt: now } };
}

/* ─── Zone lock lifecycle (S13a) ─── */

export async function acquireZoneLock(
  sessionId: number,
  zoneId: string,
  ttlSeconds = 1800,
): Promise<ActionResult<{ acquired: boolean; lockedBy: string; expiresAt: string }>> {
  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_STOCKTAKE_CREATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("acquire_zone_lock", {
    p_session_id: sessionId,
    p_zone_id: zoneId,
    p_ttl_seconds: ttlSeconds,
  });
  if (error || !data) {
    return { success: false, error: "Không acquire được lock" };
  }
  const raw = data as Record<string, unknown>;
  return {
    success: true,
    data: {
      acquired: Boolean(raw.acquired),
      lockedBy: String(raw.locked_by ?? ""),
      expiresAt: String(raw.expires_at ?? ""),
    },
  };
}

export async function heartbeatZoneLock(
  sessionId: number,
  zoneId: string,
  ttlSeconds = 1800,
): Promise<ActionResult<{ expiresAt: string }>> {
  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_STOCKTAKE_CREATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("heartbeat_zone_lock", {
    p_session_id: sessionId,
    p_zone_id: zoneId,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) {
    return { success: false, error: "Lock không còn hoặc mất ownership" };
  }
  return { success: true, data: { expiresAt: String(data ?? "") } };
}

export async function releaseZoneLock(
  sessionId: number,
  zoneId: string,
): Promise<ActionResult<{ released: boolean }>> {
  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_STOCKTAKE_CREATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("release_zone_lock", {
    p_session_id: sessionId,
    p_zone_id: zoneId,
  });
  if (error) return { success: false, error: "Không release được" };
  return { success: true, data: { released: Boolean(data) } };
}

/* ─── Recount ladder (S13b) ─── */

const closeRecountSchema = z.object({
  sessionId: z.coerce.number().int().positive(),
  roundNo: z.coerce.number().int().min(1).max(4),
});

export type CloseRecountResult = {
  roundNo: number;
  needsRecountCount: number;
  finalCount: number;
  nextRound: number | null;
  round4EscalationRequired: boolean;
};

/**
 * Close a recount round — server computes variance, flags needs_recount,
 * and advances `current_round` when outliers remain. Wraps `close_recount_round`.
 * Requires `inventory:stocktake_recount`.
 */
export async function closeRecountRound(
  input: z.infer<typeof closeRecountSchema>,
): Promise<ActionResult<CloseRecountResult>> {
  const parsed = closeRecountSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Input không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_STOCKTAKE_RECOUNT,
  );
  if (!ctx) return { success: false, error: "Không có quyền đóng round" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("close_recount_round", {
    p_session_id: parsed.data.sessionId,
    p_round_no: parsed.data.roundNo,
  });
  if (error) {
    if (error.code === "42501") return { success: false, error: "Không có quyền đóng round" };
    return { success: false, error: "Không đóng được vòng đếm." };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  revalidatePath(`/inventory/stocktake/${parsed.data.sessionId}`);
  return {
    success: true,
    data: {
      roundNo: Number(raw.round_no ?? parsed.data.roundNo),
      needsRecountCount: Number(raw.needs_recount_count ?? 0),
      finalCount: Number(raw.final_count ?? 0),
      nextRound:
        raw.next_round === null || raw.next_round === undefined
          ? null
          : Number(raw.next_round),
      round4EscalationRequired: Boolean(raw.round_4_escalation_required),
    },
  };
}

/* ─── Round-4 escalation (S13b) ─── */

const escalateRound4Schema = z.object({
  sessionId: z.coerce.number().int().positive(),
  ingredientId: z.coerce.number().int().positive(),
  finalQty: z.coerce.number().min(0),
  note: z.string().min(20, "Ghi chú escalation phải ≥ 20 ký tự"),
});

/**
 * QLV + admin manual final for a specific ingredient at round 4.
 * Note ≥ 20 chars enforced server-side. Wraps `escalate_round_4`.
 */
export async function escalateRound4(
  input: z.infer<typeof escalateRound4Schema>,
): Promise<ActionResult<{ sessionId: number; ingredientId: number; finalQty: number }>> {
  const parsed = escalateRound4Schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Input không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_STOCKTAKE_RECOUNT,
  );
  if (!ctx) return { success: false, error: "Không có quyền escalate" };
  const { supabase } = ctx;

  const { error } = await supabase.rpc("escalate_round_4", {
    p_session_id: parsed.data.sessionId,
    p_ingredient_id: parsed.data.ingredientId,
    p_final_qty: parsed.data.finalQty,
    p_note: parsed.data.note,
  });
  if (error) {
    if (error.code === "42501") return { success: false, error: "Không có quyền escalate" };
    if (error.code === "22023") {
      return {
        success: false,
        error: "Escalation không hợp lệ hoặc thiếu ghi chú bắt buộc.",
      };
    }
    return { success: false, error: "Không escalation được dòng kiểm kê." };
  }

  revalidatePath(`/inventory/stocktake/${parsed.data.sessionId}`);
  return {
    success: true,
    data: {
      sessionId: parsed.data.sessionId,
      ingredientId: parsed.data.ingredientId,
      finalQty: parsed.data.finalQty,
    },
  };
}

/* ─── Finalize (S13b) ─── */

/**
 * Mark session `completed`. Requires all R1 lines `is_final=true`.
 * Wraps `finalize_stocktake`. Permission: `inventory:stocktake_complete`.
 */
export async function finalizeStocktake(
  sessionId: number,
): Promise<ActionResult<{ sessionId: number; completedAt: string }>> {
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    return { success: false, error: "Session id không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_STOCKTAKE_COMPLETE,
  );
  if (!ctx) return { success: false, error: "Không có quyền finalize" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("finalize_stocktake", {
    p_session_id: sessionId,
  });
  if (error) {
    if (error.code === "42501") return { success: false, error: "Không có quyền finalize" };
    if (error.code === "22023") {
      return {
        success: false,
        error: "Chưa thể hòan tất: còn dòng chưa final hoặc còn xung đột cần xử lý.",
      };
    }
    return { success: false, error: "Không hòan tất được kiểm kê." };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  revalidatePath(`/inventory/stocktake/${sessionId}`);
  return {
    success: true,
    data: {
      sessionId,
      completedAt: String(raw.completed_at ?? new Date().toISOString()),
    },
  };
}

/* ─── Conflict queue (S13b) ─── */

export type StocktakeConflictRow = {
  id: number;
  sessionId: number;
  ingredientId: number;
  ingredientName: string;
  roundNo: number;
  conflictType: "is_final_overwrite" | "concurrent_round_submit" | "clock_tamper" | "unknown";
  clientPayload: Record<string, unknown>;
  serverPayload: Record<string, unknown> | null;
  submittedBy: string | null;
  submittedAt: string;
  resolvedAt: string | null;
  resolution: "keep_server" | "apply_client" | "manual_value" | "reject" | null;
  resolutionQty: number | null;
  resolutionNote: string | null;
};

/**
 * List pending + recently-resolved stocktake conflicts for a branch.
 * Filters server-side via RLS (conflicts_read_branch policy) + join to
 * sessions for branch scope. Caller passes `branchId` for the filter.
 */
export async function listStocktakeConflicts(
  branchId: number,
  opts?: { includeResolved?: boolean; limit?: number },
): Promise<ActionResult<StocktakeConflictRow[]>> {
  if (!Number.isFinite(branchId) || branchId <= 0) {
    return { success: false, error: "Branch id không hợp lệ" };
  }
  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_STOCKTAKE_RECOUNT,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const limit = Math.max(1, Math.min(opts?.limit ?? 100, 500));
  let query = supabase
    .from("stocktake_conflicts")
    .select(
      "id, session_id, ingredient_id, round_no, conflict_type, client_payload, server_payload, submitted_by, submitted_at, resolved_at, resolution, resolution_qty, resolution_note, stocktake_sessions!inner(branch_id), ingredients!inner(name)",
    )
    .eq("stocktake_sessions.branch_id", branchId)
    .order("submitted_at", { ascending: false })
    .limit(limit);
  if (!opts?.includeResolved) {
    query = query.is("resolved_at", null);
  }

  const { data, error } = await query;
  if (error) {
    return { success: false, error: "Không tải được conflict queue" };
  }

  const rows = (data ?? []).map((r) => {
    const raw = r as Record<string, unknown>;
    const ing = (raw.ingredients ?? {}) as { name?: string };
    return {
      id: Number(raw.id ?? 0),
      sessionId: Number(raw.session_id ?? 0),
      ingredientId: Number(raw.ingredient_id ?? 0),
      ingredientName: String(ing.name ?? ""),
      roundNo: Number(raw.round_no ?? 0),
      conflictType: (raw.conflict_type ?? "unknown") as StocktakeConflictRow["conflictType"],
      clientPayload: (raw.client_payload ?? {}) as Record<string, unknown>,
      serverPayload: (raw.server_payload ?? null) as Record<string, unknown> | null,
      submittedBy: (raw.submitted_by ?? null) as string | null,
      submittedAt: String(raw.submitted_at ?? ""),
      resolvedAt: (raw.resolved_at ?? null) as string | null,
      resolution: (raw.resolution ?? null) as StocktakeConflictRow["resolution"],
      resolutionQty:
        raw.resolution_qty === null || raw.resolution_qty === undefined
          ? null
          : Number(raw.resolution_qty),
      resolutionNote: (raw.resolution_note ?? null) as string | null,
    };
  });
  return { success: true, data: rows };
}

const resolveConflictSchema = z.object({
  conflictId: z.coerce.number().int().positive(),
  resolution: z.enum(["keep_server", "apply_client", "manual_value", "reject"]),
  manualQty: z.coerce.number().min(0).optional(),
  note: z.string().max(500).optional(),
});

/**
 * Resolve a single conflict. `manual_value` requires `manualQty`.
 * Wraps `resolve_stocktake_conflict`.
 */
export async function resolveStocktakeConflict(
  input: z.infer<typeof resolveConflictSchema>,
): Promise<ActionResult<{ conflictId: number; resolution: string; finalQty: number | null }>> {
  const parsed = resolveConflictSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Input không hợp lệ" };
  }
  if (parsed.data.resolution === "manual_value" && parsed.data.manualQty === undefined) {
    return { success: false, error: "Phải nhập số lượng thủ công" };
  }

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_STOCKTAKE_RECOUNT,
  );
  if (!ctx) return { success: false, error: "Không có quyền resolve" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("resolve_stocktake_conflict", {
    p_conflict_id: parsed.data.conflictId,
    p_resolution: parsed.data.resolution,
    p_manual_qty: parsed.data.manualQty ?? undefined,
    p_note: parsed.data.note ?? undefined,
  });
  if (error) {
    if (error.code === "42501") return { success: false, error: "Không có quyền resolve" };
    if (error.code === "22023") {
      return {
        success: false,
        error: "Cách xử lý xung đột không hợp lệ hoặc thiếu số lượng thủ công.",
      };
    }
    return { success: false, error: "Không xử lý được xung đột kiểm kê." };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  revalidatePath(`/inventory/stocktake/conflicts`);
  return {
    success: true,
    data: {
      conflictId: Number(raw.conflict_id ?? parsed.data.conflictId),
      resolution: String(raw.resolution ?? parsed.data.resolution),
      finalQty:
        raw.final_qty === null || raw.final_qty === undefined
          ? null
          : Number(raw.final_qty),
    },
  };
}
