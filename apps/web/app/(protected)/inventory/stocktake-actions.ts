"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "./_lib/auth";
import { resolveInventoryBranchScope } from "./_lib/inventory-scope";

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
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Input không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_STOCKTAKE_CREATE,
    parsed.data.branchId,
  );
  if (!ctx) return { success: false, error: "Không có quyền tạo stocktake" };
  const { supabase, claims } = ctx;
  const scope = await resolveInventoryBranchScope(
    supabase,
    claims,
    parsed.data.branchId,
  );
  if (scope.selectedBranchId !== parsed.data.branchId) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

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
): Promise<
  ActionResult<{ appliedCount: number; conflictCount: number; roundNo: number }>
> {
  const parsed = submitCountSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Input không hợp lệ",
    };
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
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Input không hợp lệ",
    };
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
    if (error.code === "42501")
      return { success: false, error: "Không có quyền đóng round" };
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
): Promise<
  ActionResult<{ sessionId: number; ingredientId: number; finalQty: number }>
> {
  const parsed = escalateRound4Schema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Input không hợp lệ",
    };
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
    if (error.code === "42501")
      return { success: false, error: "Không có quyền escalate" };
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
    if (error.code === "42501")
      return { success: false, error: "Không có quyền finalize" };
    if (error.code === "22023") {
      return {
        success: false,
        error:
          "Chưa thể hòan tất: còn dòng chưa final hoặc còn xung đột cần xử lý.",
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
