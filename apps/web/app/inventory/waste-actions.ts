"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "./_lib/auth";

/* ─── Waste entry (S11) ─── */

const WASTE_REASON_CODES = [
  "spoiled",
  "expired",
  "dropped",
  "overcook",
  "burned",
  "contaminated",
  "quality_fail",
  "found_missing",
  "theft_suspected",
  "customer_return",
  "kds_cancel_mid_cook",
  "kds_cancel_after_cook",
  "other",
] as const;

const WASTE_SOURCE_TYPES = [
  "manual",
  "pos_return",
  "kds_cancel_before_cook",
  "kds_cancel_mid_cook",
  "kds_cancel_after_cook",
] as const;

const wasteItemSchema = z.object({
  ingredient_id: z.coerce.number().int().positive(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  unit_cost: z.coerce.number().positive().optional(),
  reason_code: z.enum(WASTE_REASON_CODES),
  note: z.string().max(500).optional(),
  photo_urls: z.array(z.string().url()).max(10).optional(),
});

const createWasteSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  locationId: z.coerce.number().int().positive(),
  items: z.array(wasteItemSchema).min(1).max(50),
  notes: z.string().max(1000).optional(),
  sourceType: z.enum(WASTE_SOURCE_TYPES).default("manual"),
  sourceRef: z.record(z.string(), z.unknown()).optional(),
});

export type CreateWasteResult = {
  issueId: number;
  issueNumber: string;
  shiftKey: string;
  itemsCreated: number;
  requiresApproval: boolean;
};

/**
 * Create a waste entry (writeoff). Wraps `create_waste_entry` RPC.
 * Enforces: inventory:writeoff perm, shift_key auto-computed,
 * tier computed per-line (0/1/2), photo required for tier >= 1.
 *
 * Returns `requiresApproval=true` when any line triggers tier-2 gate:
 * parent stock_issue stays in draft/pending until `approveWaste()` called.
 */
export async function createWasteEntry(
  input: z.infer<typeof createWasteSchema>,
): Promise<ActionResult<CreateWasteResult>> {
  const parsed = createWasteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Input không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    [],
    PERMISSION_KEYS.INVENTORY_WRITEOFF,
  );
  if (!ctx) return { success: false, error: "Không có quyền tạo phiếu huỷ" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("create_waste_entry", {
    p_branch_id: parsed.data.branchId,
    p_location_id: parsed.data.locationId,
    p_items: parsed.data.items,
    p_source_type: parsed.data.sourceType,
    p_source_ref: (parsed.data.sourceRef ?? undefined) as never,
    p_notes: parsed.data.notes ?? undefined,
  });

  if (error) {
    if (error.code === "42501") {
      return { success: false, error: "Không có quyền hoặc thiếu ảnh tier 1" };
    }
    if (error.code === "22023") {
      return { success: false, error: error.message ?? "Không tạo được phiếu huỷ" };
    }
    return { success: false, error: "Không tạo được phiếu huỷ" };
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  revalidatePath("/inventory/waste");
  revalidatePath("/inventory/issues");

  return {
    success: true,
    data: {
      issueId: Number(raw.issue_id ?? 0),
      issueNumber: String(raw.issue_number ?? ""),
      shiftKey: String(raw.shift_key ?? ""),
      itemsCreated: Number(raw.items_created ?? 0),
      requiresApproval: Boolean(raw.requires_approval ?? false),
    },
  };
}

/* ─── Waste approval (QLV, S11) ─── */

const approveWasteSchema = z.object({
  issueId: z.coerce.number().int().positive(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().max(500).optional(),
});

/**
 * Approve or reject a pending waste. Wraps `approve_waste` RPC.
 * Self-approval guard fires server-side (s3a patch): creator cannot
 * approve own unless break-glass (`accounting:period_reopen`).
 */
export async function approveWaste(
  input: z.infer<typeof approveWasteSchema>,
): Promise<ActionResult<void>> {
  const parsed = approveWasteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Input không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    [],
    PERMISSION_KEYS.INVENTORY_WASTE_APPROVE,
  );
  if (!ctx) return { success: false, error: "Không có quyền duyệt waste" };
  const { supabase } = ctx;

  const { error } = await supabase.rpc("approve_waste", {
    p_issue_id: parsed.data.issueId,
    p_decision: parsed.data.decision,
    p_note: parsed.data.note ?? undefined,
  });

  if (error) {
    if (
      error.code === "42501" &&
      error.message?.includes("self-approval")
    ) {
      return {
        success: false,
        error: "Không thể tự duyệt phiếu của mình (4-eye principle)",
      };
    }
    if (error.code === "42501") {
      return { success: false, error: "Không có quyền duyệt" };
    }
    return { success: false, error: "Không duyệt được" };
  }

  revalidatePath("/inventory/waste");
  revalidatePath("/inventory/waste/approvals");
  revalidatePath("/inventory/issues");
  return { success: true };
}

/* ─── Shift + daily cap status (S11 meter) ─── */

export type WasteCapStatus = {
  shiftKey: string;
  shiftSum: number;
  shiftCap: number;
  branchToday: number;
  branchCap: number;
};

/**
 * Compute rolling shift + branch-day waste sums for UI meters.
 * Shift cap = 1.5M per user, branch daily cap = dynamic via cron.
 * Returns all zeros if called outside a branch context.
 */
export async function getWasteCapStatus(
  branchId: number,
): Promise<ActionResult<WasteCapStatus>> {
  const ctx = await getAuthContextWithPermission(
    [],
    PERMISSION_KEYS.INVENTORY_WRITEOFF,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, user } = ctx;

  const { data: shiftKeyRaw } = await supabase.rpc("inventory_shift_key", {
    p_branch_id: branchId,
    p_at: new Date().toISOString(),
  });
  const shiftKey = String(shiftKeyRaw ?? "");

  // Aggregate user's current-shift waste total
  const { data: shiftRows } = await supabase
    .from("stock_issues")
    .select("id")
    .eq("branch_id", branchId)
    .eq("issue_type", "writeoff")
    .eq("created_by", user.id)
    .eq("shift_key", shiftKey);

  const shiftIssueIds = (shiftRows ?? []).map((r) => r.id);

  let shiftSum = 0;
  if (shiftIssueIds.length > 0) {
    const { data: shiftItems } = await supabase
      .from("stock_issue_items")
      .select("total_cost")
      .in("issue_id", shiftIssueIds);
    shiftSum = (shiftItems ?? []).reduce(
      (sum, it) => sum + Number(it.total_cost ?? 0),
      0,
    );
  }

  // Branch daily cap row (seeded nightly)
  const { data: capRow } = await supabase
    .from("branch_daily_waste_cap")
    .select("cap_vnd")
    .eq("branch_id", branchId)
    .maybeSingle();

  // Branch today's total waste across all users
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const { data: branchRows } = await supabase
    .from("stock_issues")
    .select("id")
    .eq("branch_id", branchId)
    .eq("issue_type", "writeoff")
    .gte("issued_at", since.toISOString());

  const branchIds = (branchRows ?? []).map((r) => r.id);
  let branchToday = 0;
  if (branchIds.length > 0) {
    const { data: allItems } = await supabase
      .from("stock_issue_items")
      .select("total_cost")
      .in("issue_id", branchIds);
    branchToday = (allItems ?? []).reduce(
      (sum, it) => sum + Number(it.total_cost ?? 0),
      0,
    );
  }

  return {
    success: true,
    data: {
      shiftKey,
      shiftSum,
      shiftCap: 1_500_000,
      branchToday,
      branchCap: Number(capRow?.cap_vnd ?? 500_000),
    },
  };
}

/* ─── Rolling 15-min sum by ingredient (S11 anti-split) ─── */

export type IngredientRollingStatus = {
  /** Running total value (VND) of this user's writeoff of this SKU in last 15 min. */
  rollingSum: number;
  /** Count of writeoff lines in the window. */
  lineCount: number;
  /** Threshold that triggers tier 1 photo (spec §Q1 = 150k). */
  tierOneThreshold: number;
};

/**
 * Look up current user's rolling 15-min waste sum for a specific SKU at a branch.
 * Used by `<AntiSplitRollingMeter>` to show live warning when user is about to
 * trigger tier 1 via cumulative splitting.
 */
export async function getIngredientRollingWaste(
  branchId: number,
  ingredientId: number,
): Promise<ActionResult<IngredientRollingStatus>> {
  const ctx = await getAuthContextWithPermission(
    [],
    PERMISSION_KEYS.INVENTORY_WRITEOFF,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, user } = ctx;

  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const { data: issueRows } = await supabase
    .from("stock_issues")
    .select("id")
    .eq("branch_id", branchId)
    .eq("issue_type", "writeoff")
    .eq("created_by", user.id)
    .gte("created_at", since);

  const issueIds = (issueRows ?? []).map((r) => r.id);
  if (issueIds.length === 0) {
    return {
      success: true,
      data: { rollingSum: 0, lineCount: 0, tierOneThreshold: 150_000 },
    };
  }

  const { data: itemRows } = await supabase
    .from("stock_issue_items")
    .select("total_cost")
    .eq("ingredient_id", ingredientId)
    .in("issue_id", issueIds);

  const lineCount = itemRows?.length ?? 0;
  const rollingSum = (itemRows ?? []).reduce(
    (sum, it) => sum + Number(it.total_cost ?? 0),
    0,
  );

  return {
    success: true,
    data: { rollingSum, lineCount, tierOneThreshold: 150_000 },
  };
}
