"use server";

import { z } from "zod";
import type { ActionResult } from "@comtammatu/shared/types";
import { INVENTORY_CATALOG_ROLES } from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";
import { CATALOG_MANAGE_PERMISSIONS } from "../../_lib/catalog-permissions";

const thresholdItem = z.object({
  id: z.coerce.number().int().positive(),
  min_stock_level: z.coerce.number().min(0),
});

const bulkUpdateThresholdsSchema = z.object({
  updates: z.array(thresholdItem).min(1).max(500),
});

export const bulkUpdateIngredientThresholds = withAction(
  {
    roles: INVENTORY_CATALOG_ROLES,
    schema: bulkUpdateThresholdsSchema,
    anyPermission: CATALOG_MANAGE_PERMISSIONS,
  },
  async (data, { supabase }): Promise<ActionResult> => {
    const payload = data.updates.map((row) => ({
      id: row.id,
      min_stock_level: row.min_stock_level,
      reorder_point: null,
      max_stock_level: null,
    }));

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
