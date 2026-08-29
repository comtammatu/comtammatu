"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PERMISSION_KEYS, STAFF_ROLES } from "@comtammatu/shared/auth";
import { createServiceClient } from "@comtammatu/database/supabase/service";
import type { ActionResult } from "@comtammatu/shared/types";
import { getVNDateString, getVNDayUtcRange } from "@comtammatu/shared/time";
import { getAuthContextWithPermission } from "./_lib/auth";
import { messages } from "@lib/messages";
import { getIssueBaseQuantity } from "./_lib/issue-units";
import { currentUserHasPermission } from "@/_lib/permissions";
import { inventoryPositiveQuantitySchema } from "./_lib/inventory-quantity-schema";
import {
  insufficientStockFailure,
  mapInventoryRpcFailure,
} from "./_lib/rpc-failure";
import {
  wasteApproveRpcFallback,
  wasteApproveRpcMappings,
  wasteCreateRpcFallback,
  wasteCreateRpcMappings,
} from "@lib/messages/inventory-rpc-errors";

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
  "discrepancy",
  "loss",
  "damaged",
  "other",
] as const;

const WASTE_SOURCE_TYPES = [
  "manual",
  "pos_return",
  "kds_cancel_before_cook",
  "kds_cancel_mid_cook",
  "kds_cancel_after_cook",
  "count_slip_auto_waste",
] as const;

const wasteItemSchema = z.object({
  ingredient_id: z.coerce.number().int().positive(),
  quantity: inventoryPositiveQuantitySchema,
  // Issue-role unit the qty was entered in. NULL = already base;
  // the writeoff decrement converts to base via inv_to_base().
  entry_unit_id: z.coerce.number().int().positive().nullable().optional(),
  reason_code: z.enum(WASTE_REASON_CODES),
  note: z.string().max(500).optional(),
  photo_urls: z
    .array(z.string().url())
    .min(1, "Thêm ảnh bằng chứng cho từng dòng xuất hủy.")
    .max(10),
});

const createWasteSchema = z.object({
  branchId: z.coerce.number().int().positive(),
  locationId: z.coerce.number().int().positive(),
  items: z.array(wasteItemSchema).min(1).max(50),
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
 * tier computed per-line (0/1/2), with one image required for every manual
 * writeoff line regardless of its approval tier.
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
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_WRITEOFF,
  );
  if (!ctx) return { success: false, error: "Không có quyền tạo phiếu hủy" };
  const { supabase, claims } = ctx;
  if (
    !(await currentUserHasPermission(
      parsed.data.branchId,
      PERMISSION_KEYS.INVENTORY_WRITEOFF,
    ))
  ) {
    return { success: false, error: "Không có quyền tạo phiếu hủy" };
  }
  const ingredientIds = [
    ...new Set(parsed.data.items.map((item) => item.ingredient_id)),
  ];
  const { data: stockLevels, error: stockLevelError } = await supabase
    .from("stock_levels")
    .select("ingredient_id, current_quantity")
    .eq("tenant_id", claims.tenant_id)
    .eq("branch_id", parsed.data.branchId)
    .eq("location_id", parsed.data.locationId)
    .in("ingredient_id", ingredientIds);
  if (stockLevelError) {
    return { success: false, error: messages.inventory.waste.wacLoadFailed };
  }

  const stockByIngredient = new Map(
    (stockLevels ?? []).map((level) => [
      level.ingredient_id,
      {
        currentQuantity: Number(level.current_quantity ?? 0),
      },
    ]),
  );
  const entryUnitIds = [
    ...new Set(
      parsed.data.items
        .map((item) => item.entry_unit_id)
        .filter((id): id is number => id != null),
    ),
  ];
  const factorByIngredientUnit = new Map<string, number>();
  if (entryUnitIds.length > 0) {
    const { data: unitRows, error: unitError } = await supabase
      .from("ingredient_units")
      .select("ingredient_id, unit_id, to_base_factor")
      .eq("tenant_id", claims.tenant_id)
      .eq("is_active", true)
      .in("ingredient_id", ingredientIds)
      .in("unit_id", entryUnitIds);

    if (unitError) {
      return {
        success: false,
        error: messages.inventory.waste.unitsLoadFailed,
      };
    }
    for (const row of unitRows ?? []) {
      factorByIngredientUnit.set(
        `${row.ingredient_id}:${row.unit_id}`,
        Number(row.to_base_factor ?? 1),
      );
    }
  }

  const items = [];
  for (const item of parsed.data.items) {
    const stock = stockByIngredient.get(item.ingredient_id);
    if (item.entry_unit_id == null) {
      return { success: false, error: "Chọn đơn vị cho từng dòng." };
    }
    const toBaseFactor = factorByIngredientUnit.get(
      `${item.ingredient_id}:${item.entry_unit_id}`,
    );
    const toBaseFactorValue = Number(toBaseFactor ?? 0);
    if (!Number.isFinite(toBaseFactorValue) || toBaseFactorValue <= 0) {
      return { success: false, error: "Đơn vị không thuộc nguyên liệu." };
    }
    const requestedBaseQuantity = getIssueBaseQuantity(item.quantity, {
      toBaseFactor: toBaseFactorValue,
    });
    const availableQuantity = stock?.currentQuantity ?? 0;
    if (requestedBaseQuantity > availableQuantity + 1e-9) {
      return insufficientStockFailure(item.ingredient_id);
    }
    items.push({
      ingredient_id: item.ingredient_id,
      quantity: item.quantity,
      entry_unit_id: item.entry_unit_id,
      reason_code: item.reason_code,
      note: item.note,
      photo_urls: item.photo_urls,
    });
  }

  // Each item carries entry_unit_id (the issue-role unit the qty was entered in);
  // create_waste_entry stores it on stock_issue_items so the writeoff decrement
  // and waste-tier gate convert to the ingredient base via inv_to_base(). Server
  // derives unit_cost inside the database before computing approval flags.
  const { data, error } = await supabase.rpc("create_waste_entry", {
    p_branch_id: parsed.data.branchId,
    p_location_id: parsed.data.locationId,
    p_items: items,
    p_source_type: parsed.data.sourceType,
    p_source_ref: (parsed.data.sourceRef ?? undefined) as never,
  });

  if (error) {
    return mapInventoryRpcFailure(
      error,
      wasteCreateRpcMappings,
      wasteCreateRpcFallback,
    );
  }

  const raw = (data ?? {}) as Record<string, unknown>;
  revalidatePath("/inventory/consumption");
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

const approveWasteSchema = z
  .object({
    issueId: z.coerce.number().int().positive(),
    decision: z.enum(["approved", "rejected"]),
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.decision === "rejected" && (data.note?.length ?? 0) < 5) {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "Lý do từ chối phải có ít nhất 5 ký tự",
      });
    }
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
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }

  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
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
    return mapInventoryRpcFailure(
      error,
      wasteApproveRpcMappings,
      wasteApproveRpcFallback,
    );
  }

  revalidatePath("/inventory/waste/approvals");
  revalidatePath("/inventory/consumption");
  revalidatePath("/inventory/issues");
  return { success: true };
}

/* ─── Shift + daily cap status (S11 meter) ─── */

export type WasteCapStatus = {
  shiftKey: string;
  requiresReview: boolean;
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
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_WRITEOFF,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims, userId } = ctx;
  if (
    !(await currentUserHasPermission(
      branchId,
      PERMISSION_KEYS.INVENTORY_WRITEOFF,
    ))
  ) {
    return { success: false, error: "Không có quyền" };
  }
  const monetaryClient = createServiceClient();

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
    .eq("created_by", userId)
    .eq("shift_key", shiftKey);

  const shiftIssueIds = (shiftRows ?? []).map((r) => r.id);

  let shiftSum = 0;
  if (shiftIssueIds.length > 0) {
    const { data: shiftItems } = await monetaryClient
      .from("stock_issue_items")
      .select("total_cost")
      .eq("tenant_id", claims.tenant_id)
      .in("issue_id", shiftIssueIds);
    shiftSum = (shiftItems ?? []).reduce(
      (sum, it) => sum + Number(it.total_cost ?? 0),
      0,
    );
  }

  // Branch daily cap row (seeded nightly)
  const { data: capRow } = await monetaryClient
    .from("branch_daily_waste_cap")
    .select("cap_vnd")
    .eq("branch_id", branchId)
    .maybeSingle();

  // Branch today's total waste across all users
  const since = getVNDayUtcRange(getVNDateString()).startIso;
  const { data: branchRows } = await supabase
    .from("stock_issues")
    .select("id")
    .eq("branch_id", branchId)
    .eq("issue_type", "writeoff")
    .gte("issued_at", since);

  const branchIds = (branchRows ?? []).map((r) => r.id);
  let branchToday = 0;
  if (branchIds.length > 0) {
    const { data: allItems } = await monetaryClient
      .from("stock_issue_items")
      .select("total_cost")
      .eq("tenant_id", claims.tenant_id)
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
      requiresReview:
        shiftSum >= 1_500_000 ||
        branchToday >= Number(capRow?.cap_vnd ?? 500_000),
    },
  };
}

/* ─── Rolling 15-min sum by ingredient (S11 anti-split) ─── */

export type IngredientRollingStatus = {
  lineCount: number;
  requiresReview: boolean;
};

/** Return only the non-monetary rolling review state for operational clients. */
export async function getIngredientRollingWaste(
  branchId: number,
  ingredientId: number,
): Promise<ActionResult<IngredientRollingStatus>> {
  const ctx = await getAuthContextWithPermission(
    STAFF_ROLES,
    PERMISSION_KEYS.INVENTORY_WRITEOFF,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { supabase, claims, userId } = ctx;
  if (
    !(await currentUserHasPermission(
      branchId,
      PERMISSION_KEYS.INVENTORY_WRITEOFF,
    ))
  ) {
    return { success: false, error: "Không có quyền" };
  }

  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const { data: issueRows } = await supabase
    .from("stock_issues")
    .select("id")
    .eq("branch_id", branchId)
    .eq("issue_type", "writeoff")
    .eq("created_by", userId)
    .gte("created_at", since);

  const issueIds = (issueRows ?? []).map((r) => r.id);
  if (issueIds.length === 0) {
    return {
      success: true,
      data: { lineCount: 0, requiresReview: false },
    };
  }

  const { data: itemRows } = await createServiceClient()
    .from("stock_issue_items")
    .select("total_cost")
    .eq("tenant_id", claims.tenant_id)
    .eq("ingredient_id", ingredientId)
    .in("issue_id", issueIds);

  const lineCount = itemRows?.length ?? 0;
  const rollingSum = (itemRows ?? []).reduce(
    (sum, it) => sum + Number(it.total_cost ?? 0),
    0,
  );

  return {
    success: true,
    data: { lineCount, requiresReview: rollingSum >= 150_000 },
  };
}
