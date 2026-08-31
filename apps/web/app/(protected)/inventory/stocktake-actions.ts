"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { inventoryNonnegativeQuantitySchema } from "./_lib/inventory-quantity-schema";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "./_lib/auth";
import { resolveInventoryBranchScope } from "./_lib/inventory-scope";
import { mapInventoryRpcFailure } from "./_lib/rpc-failure";
import {
  stocktakeSubmitRpcFallback,
  stocktakeSubmitRpcMappings,
} from "@lib/messages/inventory-rpc-errors";

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
  /** UI always starts a blind on-hand count; RPC still stores a mode. */
  mode: z.enum(STOCKTAKE_MODES).default("spot"),
  blindMode: z.boolean().optional().default(true),
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
 * UI always starts a blind on-hand count (`spot`, `blindMode=true`).
 */
export async function startStocktake(
  input: z.input<typeof startStocktakeSchema>,
): Promise<ActionResult<StocktakeStartResult>> {
  const parsed = startStocktakeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
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
        counted_quantity: inventoryNonnegativeQuantitySchema,
        // Unit the physical count was entered in. submit_count_round converts
        // it to the ingredient base via inv_to_base(). null => already base.
        entry_unit_id: z.coerce.number().int().positive().nullable().optional(),
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
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
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
    return mapInventoryRpcFailure(
      error,
      stocktakeSubmitRpcMappings,
      stocktakeSubmitRpcFallback,
    );
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
  roundNo: z.coerce.number().int().min(1).max(4),
  draftCounts: z.record(z.string(), z.unknown()),
});

/**
 * Auto-save counter's in-progress counts to `stocktake_drafts`.
 * Debounced 30s from client. A round envelope prevents an old round's draft
 * from being restored into a later recount round.
 *
 * Stored shape: `{ roundNo, counts: { [ingredient_id]: { qty, savedAt } } }`.
 */
export async function saveStocktakeDraft(
  input: z.infer<typeof saveDraftSchema>,
): Promise<ActionResult<{ lastSavedAt: string }>> {
  const parsed = saveDraftSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_STOCKTAKE_CREATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, userId } = ctx;

  const now = new Date().toISOString();
  const { error } = await supabase.from("stocktake_drafts").upsert(
    {
      session_id: parsed.data.sessionId,
      // Generated types narrow draft_counts to Json; Record<string, unknown>
      // is functionally equivalent but not assignable. JSON.parse/stringify
      // round-trip keeps the runtime value identical and satisfies the type.
      draft_counts: JSON.parse(
        JSON.stringify({
          roundNo: parsed.data.roundNo,
          counts: parsed.data.draftCounts,
        }),
      ) as Record<string, never>,
      last_saved_at: now,
      saved_by: userId,
    },
    { onConflict: "session_id" },
  );

  if (error) {
    return { success: false, error: "Không thể lưu bản nháp" };
  }

  return { success: true, data: { lastSavedAt: now } };
}
