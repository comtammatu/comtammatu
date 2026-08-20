"use server";

import { z } from "zod";
import { MODULE_ACL, PERMISSION_KEYS } from "@comtammatu/shared/auth";
import type { Database } from "@comtammatu/database/types";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { revalidateSurfacePath } from "@/_lib/revalidate-surface";
import { withAction } from "@/_lib/with-action";
import { mapPromotionRpcError } from "@lib/promotions/rpc-errors";
import {
  PROMOTION_KINDS,
  PROMOTION_STATUSES,
} from "@lib/promotions/kinds";

const OWNER_ROLES = MODULE_ACL.promotions.allowedRoles;

const timeWindowSchema = z.object({
  dow: z.coerce.number().int().min(0).max(6),
  start: z.string().regex(/^\d{2}:\d{2}$/, { error: "Giờ không hợp lệ" }),
  end: z.string().regex(/^\d{2}:\d{2}$/, { error: "Giờ không hợp lệ" }),
});

const itemSchema = z.object({
  menu_item_id: z.coerce.number().int().positive(),
  item_role: z.enum(["eligible", "buy", "get"]).default("eligible"),
});

const upsertSchema = z
  .object({
    id: z.number().int().positive().nullable().optional(),
    name: z
      .string()
      .trim()
      .min(1, { error: "Tên chiến dịch không được để trống" })
      .max(80, { error: "Tên tối đa 80 ký tự" }),
    kind: z.enum(PROMOTION_KINDS, { error: "Loại chiến dịch không hợp lệ" }),
    status: z.enum(PROMOTION_STATUSES).default("draft"),
    discountType: z.enum(["pct", "vnd"]).nullable().optional(),
    discountValue: z.number().min(0).nullable().optional(),
    minSubtotal: z.number().min(0).default(0),
    maxDiscountAmount: z.number().positive().nullable().optional(),
    stackWithItemDiscount: z.boolean().default(true),
    startsAt: z.string().nullable().optional(),
    endsAt: z.string().nullable().optional(),
    timeWindows: z.array(timeWindowSchema).default([]),
    serviceModes: z
      .array(z.enum(["dine_in", "takeaway", "delivery"]))
      .min(1, { error: "Chọn ít nhất một hình thức phục vụ" })
      .default(["dine_in", "takeaway"]),
    bxgyBuyQty: z.number().int().min(1).nullable().optional(),
    bxgyGetQty: z.number().int().min(1).nullable().optional(),
    freeSideQty: z.number().int().min(1).nullable().optional(),
    freeItemQty: z.number().int().min(1).nullable().optional(),
    allowCode: z.boolean().default(true),
    allowAuto: z.boolean().default(false),
    branchIds: z.array(z.number().int().positive()).default([]),
    items: z.array(itemSchema).default([]),
    reusableCode: z.string().trim().max(32).optional().default(""),
  })
  .superRefine((values, ctx) => {
    if (
      (values.kind === "order_pct" ||
        values.kind === "order_vnd" ||
        (values.kind === "free_side" && values.allowCode) ||
        values.kind === "free_item") &&
      values.reusableCode.trim() === ""
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["reusableCode"],
        message: "Mã giảm không được để trống",
      });
    }
    if (values.kind === "free_side") {
      if (!values.allowCode && !values.allowAuto) {
        ctx.addIssue({
          code: "custom",
          path: ["allowCode"],
          message: "Chọn ít nhất một cách kích hoạt",
        });
      }
      if ((values.freeSideQty ?? 0) < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["freeSideQty"],
          message: "Số phần tặng phải từ 1",
        });
      }
    }
    if (values.kind === "free_item") {
      if (values.items.filter((item) => item.item_role === "get").length < 1) {
        ctx.addIssue({
          code: "custom",
          path: ["items"],
          message: "Chọn món được tặng",
        });
      }
    }
  });

const statusSchema = z.object({
  id: z.number().int().positive(),
  status: z.enum(PROMOTION_STATUSES),
});

const issueSchema = z.object({
  promotionId: z.number().int().positive(),
  count: z.number().int().min(1).max(200),
  faceValue: z.number().min(0).nullable().optional(),
});

const voidSchema = z.object({
  codeId: z.number().int().positive(),
  reason: z
    .string()
    .trim()
    .min(3, { error: "Lý do hủy mã tối thiểu 3 ký tự" })
    .max(200),
});

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

export const upsertPromotion = withAction(
  {
    roles: OWNER_ROLES,
    schema: upsertSchema,
    permission: PERMISSION_KEYS.PROMO_WRITE,
  },
  async (input, { supabase }): Promise<ActionResult<{ id: number }>> => {
    const { data, error } = await supabase.rpc("upsert_promotion", {
      p_id: input.id ?? null,
      p_name: input.name,
      p_kind: input.kind,
      p_status: input.status,
      p_discount_type: input.discountType ?? null,
      p_discount_value: input.discountValue ?? null,
      p_min_subtotal: input.minSubtotal,
      p_max_discount_amount: input.maxDiscountAmount ?? null,
      p_stack_with_item_discount: input.stackWithItemDiscount,
      p_starts_at: emptyToNull(input.startsAt),
      p_ends_at: emptyToNull(input.endsAt),
      p_time_windows: input.timeWindows,
      p_service_modes: input.serviceModes,
      p_bxgy_buy_qty: input.bxgyBuyQty ?? null,
      p_bxgy_get_qty: input.bxgyGetQty ?? null,
      p_free_side_qty: input.freeSideQty ?? null,
      p_free_item_qty: input.freeItemQty ?? null,
      p_allow_code: input.allowCode,
      p_allow_auto: input.allowAuto,
      p_branch_ids: input.branchIds,
      p_items: input.items,
      p_reusable_code: input.reusableCode.trim().toUpperCase(),
    } as Database["public"]["Functions"]["upsert_promotion"]["Args"]);

    if (error) {
      return { success: false, error: mapPromotionRpcError(error.message) };
    }

    const result = data as { id?: number } | null;
    const id = result?.id;
    if (typeof id !== "number") {
      return { success: false, error: "Không thể lưu chiến dịch." };
    }

    revalidateSurfacePath("/promotions");
    return { success: true, data: { id } };
  },
);

export const setPromotionStatus = withAction(
  {
    roles: OWNER_ROLES,
    schema: statusSchema,
    permission: PERMISSION_KEYS.PROMO_WRITE,
  },
  async (input, { supabase }): Promise<ActionResult<{ status: string }>> => {
    const { error } = await supabase.rpc("set_promotion_status", {
      p_promotion_id: input.id,
      p_status: input.status,
    });
    if (error) {
      return { success: false, error: mapPromotionRpcError(error.message) };
    }
    revalidateSurfacePath("/promotions");
    return { success: true, data: { status: input.status } };
  },
);

export const issuePromotionCodes = withAction(
  {
    roles: OWNER_ROLES,
    schema: issueSchema,
    permission: PERMISSION_KEYS.PROMO_ISSUE,
  },
  async (
    input,
    { supabase },
  ): Promise<ActionResult<{ count: number }>> => {
    const { data, error } = await supabase.rpc("issue_promotion_codes", {
      p_promotion_id: input.promotionId,
      p_count: input.count,
      p_face_value: input.faceValue ?? 0,
    });
    if (error) {
      return { success: false, error: mapPromotionRpcError(error.message) };
    }
    const result = data as { count?: number } | null;
    revalidateSurfacePath("/promotions");
    return {
      success: true,
      data: { count: Number(result?.count ?? input.count) },
    };
  },
);

export const voidPromotionCode = withAction(
  {
    roles: OWNER_ROLES,
    schema: voidSchema,
    permission: PERMISSION_KEYS.PROMO_ISSUE,
  },
  async (input, { supabase }): Promise<ActionResult> => {
    const { error } = await supabase.rpc("void_promotion_code", {
      p_code_id: input.codeId,
      p_reason: input.reason,
    });
    if (error) {
      return { success: false, error: mapPromotionRpcError(error.message) };
    }
    revalidateSurfacePath("/promotions");
    return { success: true, data: null };
  },
);

export async function loadPromotionsAuth() {
  return getAuthContextWithPermission(
    OWNER_ROLES,
    PERMISSION_KEYS.PROMO_READ,
  );
}
