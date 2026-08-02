"use server";

import { z } from "zod";
import { INVENTORY_OPS_ROLES } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { withAction } from "@/_lib/with-action";
import { PG_ERR } from "./_lib/constants";
import { inventoryNonzeroQuantitySchema } from "./_lib/inventory-quantity-schema";

const correctionDocumentTypes = [
  "grn",
  "issue",
  "transfer",
  "production_run",
] as const;

const correctionSchema = z.object({
  documentType: z.enum(correctionDocumentTypes),
  documentId: z.coerce.number().int().positive(),
  branchId: z.coerce.number().int().positive(),
  ingredientId: z.coerce.number().int().positive(),
  quantityChange: inventoryNonzeroQuantitySchema,
  reason: z
    .string()
    .trim()
    .min(10, { error: "Lý do điều chỉnh cần ít nhất 10 ký tự." })
    .max(500, { error: "Lý do điều chỉnh tối đa 500 ký tự." }),
  idempotencyKey: z.uuid(),
});

export type InventoryCorrectionDocumentType =
  (typeof correctionDocumentTypes)[number];

export const createInventoryDocumentCorrection = withAction(
  {
    roles: INVENTORY_OPS_ROLES,
    schema: correctionSchema,
    requireBranchScope: true,
  },
  async (data, { supabase }): Promise<ActionResult<{ id: number }>> => {
    const { data: result, error } = await supabase.rpc(
      "create_inventory_document_correction",
      {
        p_document_type: data.documentType,
        p_document_id: data.documentId,
        p_branch_id: data.branchId,
        p_ingredient_id: data.ingredientId,
        p_quantity_change: data.quantityChange,
        p_reason: data.reason,
        p_idempotency_key: data.idempotencyKey,
      },
    );

    if (error) {
      const message = error.message ?? "";
      if (error.code === PG_ERR.INSUFFICIENT_PRIVILEGE) {
        return { success: false, error: "Không có quyền điều chỉnh tồn kho." };
      }
      if (error.code === "P0002" || message.includes("source_")) {
        return {
          success: false,
          error:
            "Không tìm thấy chứng từ đã chốt phù hợp với mặt hàng và chi nhánh.",
        };
      }
      if (message.includes("insufficient_stock")) {
        return {
          success: false,
          error: "Không đủ tồn kho để ghi điều chỉnh này.",
        };
      }
      if (message.includes("entry_unit_not_found")) {
        return { success: false, error: "Đơn vị không thuộc nguyên liệu." };
      }
      if (error.code === PG_ERR.UNIQUE_VIOLATION) {
        return {
          success: false,
          error: "Yêu cầu điều chỉnh đã thay đổi. Vui lòng thử lại.",
        };
      }
      if (
        error.code === PG_ERR.CHECK_VIOLATION ||
        error.code === PG_ERR.INVALID_TEXT_REPRESENTATION
      ) {
        return {
          success: false,
          error: "Không thể điều chỉnh tồn kho do dữ liệu không hợp lệ.",
        };
      }
      return { success: false, error: "Không thể tạo điều chỉnh tồn kho." };
    }

    const movementId = Number(
      result && typeof result === "object" && !Array.isArray(result)
        ? result["movement_id"]
        : undefined,
    );
    return Number.isSafeInteger(movementId) && movementId > 0
      ? { success: true, data: { id: movementId } }
      : { success: false, error: "Không thể tạo điều chỉnh tồn kho." };
  },
);
