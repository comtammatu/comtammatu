"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "./_lib/auth";

/* ─── GRN price baseline (S10) ─── */

export type BaselineInfo = {
  /** 30-day avg unit cost, or null when not enough history */
  avgUnitCost: number | null;
  /** Number of confirmed GRN lines that contributed */
  sampleN: number;
  /** ISO date of last GRN contributing to baseline */
  lastSeenAt: string | null;
  /** Source: same_supplier / any_supplier / none / paused */
  source: "same_supplier" | "any_supplier" | "none" | "paused" | string;
};

/**
 * Fetch 30-day baseline unit cost for a (supplier, ingredient, uom) combo.
 * Wraps Postgres `get_grn_price_baseline` RPC — enforces
 * `procurement:price_list_read` permission + baseline_sample_n >= 3 fallback chain.
 *
 * Returns `source='paused'` when a recent hardblock override installed a
 * 30-day baseline pause; UI must treat this specially (neither tier nor block).
 * Returns `source='none'` when < 3 samples — caller falls back to manual approve.
 */
export async function getBaselinePrice(
  supplierId: number,
  ingredientId: number,
  uom: string | null,
): Promise<ActionResult<BaselineInfo>> {
  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.PROCUREMENT_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("get_grn_price_baseline", {
    p_supplier_id: supplierId,
    p_ingredient_id: ingredientId,
    p_uom: uom ?? undefined,
  });

  if (error) {
    return { success: false, error: "Không tải được giá tham chiếu." };
  }

  // RPC returns a TABLE (1 row) — supabase-js wraps as array.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      success: true,
      data: {
        avgUnitCost: null,
        sampleN: 0,
        lastSeenAt: null,
        source: "none",
      },
    };
  }

  return {
    success: true,
    data: {
      avgUnitCost: row.avg_30d === null ? null : Number(row.avg_30d),
      sampleN: Number(row.sample_n ?? 0),
      lastSeenAt: row.last_seen_at ?? null,
      source: row.baseline_source ?? "none",
    },
  };
}

/* ─── GRN auto-approve evaluator (S10/S14) ─── */

export type AutoApproveEvaluation = {
  grnId: number;
  approved: boolean;
  hardOk: boolean;
  softOk: boolean;
  inWindow: boolean;
  inBaseWindow: boolean;
  inExtendedWindow: boolean;
  totalGrnValue: number | null;
  totalPoValue: number | null;
  supplierGrnCount90d: number;
  trustScore: number | null;
  conditions: {
    c1_has_po: boolean;
    c2_variance_ok: boolean;
    c3_line_totals_diff: boolean;
    c4_no_quality_issue: boolean;
    c5_value_cap: boolean;
    c6_supplier_history: boolean;
    c7_no_manual_review: boolean;
    c8_trust_score_ok: boolean;
  };
  failedReasons: string[];
  evaluatedAt: string;
};

/**
 * Evaluate whether a GRN is eligible for auto-approve.
 * Wraps `grn_is_auto_approvable` RPC. Server-side evaluator is
 * authoritative; the UI should re-fetch this on every form change
 * rather than caching past evaluations.
 */
export async function evaluateAutoApprove(
  grnId: number,
): Promise<ActionResult<AutoApproveEvaluation>> {
  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("grn_is_auto_approvable", {
    p_grn_id: grnId,
  });

  if (error || !data) {
    return { success: false, error: "Không đánh giá được auto-approve." };
  }

  // RPC returns JSONB — parsed natively by supabase-js.
  const raw = data as Record<string, unknown>;
  const conditions = (raw.conditions ?? {}) as Record<string, boolean>;
  const failedReasonsRaw = raw.failed_reasons;
  const failedReasons = Array.isArray(failedReasonsRaw)
    ? failedReasonsRaw.filter((r): r is string => typeof r === "string")
    : [];

  return {
    success: true,
    data: {
      grnId: Number(raw.grn_id ?? grnId),
      approved: Boolean(raw.approved),
      hardOk: Boolean(raw.hard_ok),
      softOk: Boolean(raw.soft_ok),
      inWindow: Boolean(raw.in_window),
      inBaseWindow: Boolean(raw.in_base_window),
      inExtendedWindow: Boolean(raw.in_extended_window),
      totalGrnValue:
        raw.total_grn_value === null ? null : Number(raw.total_grn_value),
      totalPoValue:
        raw.total_po_value === null ? null : Number(raw.total_po_value),
      supplierGrnCount90d: Number(raw.supplier_grn_count_90d ?? 0),
      trustScore: raw.trust_score === null ? null : Number(raw.trust_score),
      conditions: {
        c1_has_po: Boolean(conditions.c1_has_po),
        c2_variance_ok: Boolean(conditions.c2_variance_ok),
        c3_line_totals_diff: Boolean(conditions.c3_line_totals_diff),
        c4_no_quality_issue: Boolean(conditions.c4_no_quality_issue),
        c5_value_cap: Boolean(conditions.c5_value_cap),
        c6_supplier_history: Boolean(conditions.c6_supplier_history),
        c7_no_manual_review: Boolean(conditions.c7_no_manual_review),
        c8_trust_score_ok: Boolean(conditions.c8_trust_score_ok),
      },
      failedReasons,
      evaluatedAt: (raw.evaluated_at as string | undefined) ?? new Date().toISOString(),
    },
  };
}

/* ─── Override code verification (S10 tier-2 guard) ─── */

/**
 * Verify the per-branch bcrypt override code for GRN variance tier 2.
 * Wraps `verify_branch_override_code` RPC which enforces rate-limit
 * 3 failed attempts / minute / user. Every attempt logged to
 * `branch_override_attempts` for anomaly detection.
 *
 * Returns `{ verified: true }` on success, or `{ verified: false, reason }`
 * on failure (rate-limited / wrong code / unauthorized).
 */
export async function verifyOverrideCode(
  branchId: number,
  code: string,
): Promise<ActionResult<{ verified: boolean }>> {
  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.PROCUREMENT_GRN_CREATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("verify_branch_override_code", {
    p_branch_id: branchId,
    p_code: code,
  });

  if (error) {
    // 54000 = rate-limit exceeded; other codes = generic failure.
    if (error.code === "54000") {
      return { success: false, error: "Vượt giới hạn 3 lần/phút — đợi và thử lại." };
    }
    return { success: false, error: "Mã xác nhận không hợp lệ." };
  }

  return { success: true, data: { verified: Boolean(data) } };
}

/* ─── Hardblock override (S10 tier-3) ─── */

const hardblockOverrideSchema = z.object({
  grnItemId: z.coerce.number().int().positive(),
  evidenceUrl: z.string().url(),
  reasonCode: z.enum([
    "market_spike",
    "contract_new",
    "quality_upgrade",
    "fx_jump",
    "emergency_supply",
    "other",
  ]),
  note: z.string().min(50, { error: "Ghi chú tối thiểu 50 ký tự" }),
});

/**
 * Submit a tier-3 hardblock override for a GRN line.
 * Wraps `override_grn_hardblock` RPC. PDF must already be uploaded to
 * the `grn-evidence` bucket (via PhotoUploadInput bucket prop) and the
 * resulting public URL passed here.
 *
 * Enforces: rate-limit 2/week/user, note ≥50 chars, inserts 30-day
 * baseline pause for the (supplier, ingredient) pair.
 *
 * Returns the inserted `grn_hardblock_overrides.id` on success.
 */
export async function submitHardblockOverride(
  input: z.infer<typeof hardblockOverrideSchema>,
): Promise<ActionResult<{ overrideId: number }>> {
  const parsed = hardblockOverrideSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Input không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_GRN_HARDBLOCK_OVERRIDE,
  );
  if (!ctx) return { success: false, error: "Không có quyền override hardblock" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("override_grn_hardblock", {
    p_grn_item_id: parsed.data.grnItemId,
    p_evidence_url: parsed.data.evidenceUrl,
    p_reason_code: parsed.data.reasonCode,
    p_note: parsed.data.note,
  });

  if (error) {
    if (error.code === "54000") {
      return { success: false, error: "Đã override 2/2 tuần này — liên hệ Admin" };
    }
    if (error.code === "42501") {
      return { success: false, error: "Không có quyền override" };
    }
    return { success: false, error: "Không override được — thử lại sau" };
  }

  revalidatePath("/inventory/grn");
  return { success: true, data: { overrideId: Number(data) } };
}

/* ─── Override code rotation (S10 admin) ─── */

const rotateCodeSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  newCode: z.string().min(6, { error: "Mã tối thiểu 6 ký tự" }),
});

/**
 * Rotate the per-branch override code (bcrypt hashed).
 * Wraps `rotate_branch_override_code` RPC. Requires
 * `procurement:override_code_rotate` permission for the branch.
 *
 * Only the new plaintext code is passed in — server hashes via pgcrypto
 * and never stores plaintext. Admin must manually distribute the new code
 * to QLV staff out-of-band.
 */
export async function rotateOverrideCode(
  input: z.infer<typeof rotateCodeSchema>,
): Promise<ActionResult<void>> {
  const parsed = rotateCodeSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Input không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.PROCUREMENT_OVERRIDE_CODE_ROTATE,
  );
  if (!ctx) return { success: false, error: "Không có quyền rotate code" };
  const { supabase } = ctx;

  const { error } = await supabase.rpc("rotate_branch_override_code", {
    p_branch_id: parsed.data.branchId,
    p_new_code: parsed.data.newCode,
  });

  if (error) {
    return { success: false, error: "Không rotate được mã override" };
  }

  revalidatePath("/admin/inventory/express-windows");
  return { success: true };
}

/* ─── Express window config (S10/S14) ─── */

const configureWindowSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  enabled: z.boolean(),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, { error: "HH:MM format" }),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, { error: "HH:MM format" }),
});

/**
 * Configure base Express auto-approve window per branch.
 * Wraps `configure_express_window` RPC. Requires
 * `inventory:grn_express_configure` permission (QLV/Admin).
 * Default 06:00-09:00 local to `branches.timezone`.
 */
export async function configureExpressWindow(
  input: z.infer<typeof configureWindowSchema>,
): Promise<ActionResult<void>> {
  const parsed = configureWindowSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Input không hợp lệ" };
  }
  if (parsed.data.startTime >= parsed.data.endTime) {
    return { success: false, error: "Giờ bắt đầu phải trước giờ kết thúc" };
  }

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_GRN_EXPRESS_CONFIGURE,
  );
  if (!ctx) return { success: false, error: "Không có quyền cấu hình" };
  const { supabase } = ctx;

  const { error } = await supabase.rpc("configure_express_window", {
    p_branch_id: parsed.data.branchId,
    p_enabled: parsed.data.enabled,
    p_start_time: parsed.data.startTime,
    p_end_time: parsed.data.endTime,
  });

  if (error) {
    return { success: false, error: "Không lưu được cấu hình" };
  }

  revalidatePath("/admin/inventory/express-windows");
  return { success: true };
}

/* ─── Extend Express window (S10/S14, QL CN) ─── */

const extendWindowSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  minutes: z.coerce.number().int().min(1).max(60),
  note: z.string().min(10, { error: "Ghi chú tối thiểu 10 ký tự" }),
});

/**
 * QL CN extend today's Express window by +N minutes (max 60).
 * Wraps `extend_express_window` RPC. Rate-limit 3 extends/week/user.
 *
 * Returns new absolute end timestamp on success; toast should display.
 */
export async function extendExpressWindow(
  input: z.infer<typeof extendWindowSchema>,
): Promise<ActionResult<{ extendedUntil: string }>> {
  const parsed = extendWindowSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Input không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_GRN_EXPRESS_EXTEND,
  );
  if (!ctx) return { success: false, error: "Không có quyền extend window" };
  const { supabase } = ctx;

  const { data, error } = await supabase.rpc("extend_express_window", {
    p_branch_id: parsed.data.branchId,
    p_minutes: parsed.data.minutes,
    p_note: parsed.data.note,
  });

  if (error) {
    if (error.code === "54000") {
      return { success: false, error: "Đã extend 3/3 lần tuần này" };
    }
    return { success: false, error: "Không extend được window" };
  }

  revalidatePath("/inventory/grn");
  return { success: true, data: { extendedUntil: String(data) } };
}
