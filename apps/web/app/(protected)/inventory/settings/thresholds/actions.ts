"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { INVENTORY_CATALOG_ROLES } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";
import { CATALOG_MANAGE_PERMISSIONS } from "../../_lib/catalog-permissions";

const thresholdItem = z
  .object({
    id: z.coerce.number().int().positive(),
    min_stock_level: z.coerce.number().min(0).optional(),
    max_stock_level: z.coerce.number().min(0).nullable().optional(),
    reorder_point: z.coerce.number().min(0).nullable().optional(),
  })
  .refine(
    ({ min_stock_level, reorder_point }) =>
      min_stock_level == null ||
      reorder_point == null ||
      min_stock_level <= reorder_point,
    { error: "Tồn tối thiểu phải ≤ Điểm đặt lại" },
  )
  .refine(
    ({ reorder_point, max_stock_level }) =>
      reorder_point == null ||
      max_stock_level == null ||
      reorder_point <= max_stock_level,
    { error: "Điểm đặt lại phải ≤ Tồn tối đa" },
  )
  .refine(
    ({ min_stock_level, max_stock_level }) =>
      min_stock_level == null ||
      max_stock_level == null ||
      min_stock_level <= max_stock_level,
    { error: "Tồn tối thiểu phải ≤ Tồn tối đa" },
  );

const bulkUpdateThresholdsSchema = z.object({
  updates: z.array(thresholdItem).min(1).max(500),
});

export type BulkUpdateThresholdsInput = z.infer<
  typeof bulkUpdateThresholdsSchema
>;

export const bulkUpdateIngredientThresholds = withAction(
  {
    roles: INVENTORY_CATALOG_ROLES,
    schema: bulkUpdateThresholdsSchema,
    anyPermission: CATALOG_MANAGE_PERMISSIONS,
  },
  async (data, { supabase }): Promise<ActionResult> => {
    // Build payload retaining "field present vs absent" semantics so the
    // RPC can distinguish "leave as-is" from "set NULL".
    const payload = data.updates.map((row) => {
      const item: Record<string, unknown> = { id: row.id };
      if (row.min_stock_level !== undefined) {
        item.min_stock_level = row.min_stock_level;
      }
      if ("max_stock_level" in row) {
        item.max_stock_level = row.max_stock_level ?? null;
      }
      if ("reorder_point" in row) {
        item.reorder_point = row.reorder_point ?? null;
      }
      return item;
    });

    const { data: result, error } = await supabase.rpc(
      "update_ingredient_thresholds_bulk",
      { p_payload: payload as unknown as never },
    );

    if (error) {
      return { success: false, error: "Không thể cập nhật ngưỡng tồn kho." };
    }

    const parsed = z
      .object({
        updated: z.coerce.number().int().min(0),
        requested: z.coerce.number().int().min(0).optional(),
      })
      .safeParse(result);
    if (!parsed.success) {
      return { success: false, error: "Phản hồi không hợp lệ từ máy chủ." };
    }

    return {
      success: true,
      data: { updated: parsed.data.updated },
    };
  },
);
