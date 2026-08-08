"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  PERMISSION_KEYS,
  STOCK_REQUEST_FULFILL_ROLES,
  STOCK_REQUEST_ROLES,
} from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";
import { inventoryPositiveQuantitySchema } from "./_lib/inventory-quantity-schema";
import { mapInventoryRpcFailure } from "./_lib/rpc-failure";
import {
  stockRequestRpcFallback,
  stockRequestRpcMappings,
} from "@lib/messages/inventory-rpc-errors";

type RpcJson = {
  transfer_id?: number;
  id?: number;
};

const stockRequestLineSchema = z.object({
  ingredientId: z.coerce.number().int().positive(),
  entryUnitId: z.coerce.number().int().positive(),
  quantity: inventoryPositiveQuantitySchema,
  notes: z.string().trim().max(500).optional(),
});

export const saveStockRequest = withAction(
  {
    roles: STOCK_REQUEST_ROLES,
    schema: z.object({
      branchId: z.coerce.number().int().positive(),
      requestId: z.coerce.number().int().positive().nullable().optional(),
      neededAt: z.string().datetime().nullable().optional(),
      notes: z.string().trim().max(500).optional(),
      lines: z.array(stockRequestLineSchema).min(1).max(200),
      submit: z.boolean().default(true),
      idempotencyKey: z.string().uuid().optional(),
    }),
    permission: PERMISSION_KEYS.INVENTORY_REQUEST_CREATE,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase }) => {
    const { data: raw, error } = await supabase.rpc(
      "save_stock_request" as never,
      {
        p_request_id: data.requestId ?? null,
        p_branch_id: data.branchId,
        p_needed_at: data.neededAt ?? null,
        p_notes: data.notes ?? "",
        p_lines: data.lines.map((line) => ({
          ingredient_id: line.ingredientId,
          entry_unit_id: line.entryUnitId,
          quantity: line.quantity,
          notes: line.notes ?? "",
        })),
        p_submit: data.submit,
        p_idempotency_key: data.idempotencyKey ?? null,
      } as never,
    );
    if (error) {
      return mapInventoryRpcFailure(
        error,
        stockRequestRpcMappings,
        stockRequestRpcFallback,
      );
    }
    const parsed = z
      .object({
        request_id: z.coerce.number().int().positive(),
        request_number: z.string(),
        status: z.enum(["draft", "submitted"]),
      })
      .safeParse(raw);
    if (!parsed.success) {
      return { success: false as const, error: "Không lưu được yêu cầu hàng." };
    }
    revalidatePath(`/br/${data.branchId}/stock/transfer`);
    revalidatePath(
      `/br/${data.branchId}/stock/requests/${parsed.data.request_id}`,
    );
    revalidatePath("/inventory/transfers");
    return {
      success: true as const,
      data: {
        requestId: parsed.data.request_id,
        requestNumber: parsed.data.request_number,
        status: parsed.data.status,
      },
    };
  },
);

export const cancelStockRequest = withAction(
  {
    roles: STOCK_REQUEST_ROLES,
    schema: z.object({
      branchId: z.coerce.number().int().positive(),
      requestId: z.coerce.number().int().positive(),
      reason: z.string().trim().min(5).max(500),
    }),
    permission: PERMISSION_KEYS.INVENTORY_REQUEST_CANCEL,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc(
      "cancel_stock_request" as never,
      {
        p_request_id: data.requestId,
        p_reason: data.reason,
      } as never,
    );
    if (error) {
      return mapInventoryRpcFailure(
        error,
        stockRequestRpcMappings,
        stockRequestRpcFallback,
      );
    }
    revalidatePath(`/br/${data.branchId}/stock/transfer`);
    revalidatePath(`/br/${data.branchId}/stock/requests/${data.requestId}`);
    revalidatePath("/inventory/transfers");
    return { success: true as const };
  },
);

export const closeStockRequest = withAction(
  {
    roles: ["owner"] as const,
    schema: z.object({
      requestId: z.coerce.number().int().positive(),
      reason: z.string().trim().min(5).max(500),
    }),
    permission: PERMISSION_KEYS.INVENTORY_REQUEST_FULFILL,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc(
      "close_stock_request" as never,
      {
        p_request_id: data.requestId,
        p_reason: data.reason,
      } as never,
    );
    if (error) {
      return mapInventoryRpcFailure(
        error,
        stockRequestRpcMappings,
        stockRequestRpcFallback,
      );
    }
    revalidatePath("/inventory/transfers");
    revalidatePath(`/inventory/stock-requests/${data.requestId}`);
    return { success: true as const };
  },
);

export const rejectStockRequestLines = withAction(
  {
    roles: STOCK_REQUEST_FULFILL_ROLES,
    schema: z.object({
      requestId: z.coerce.number().int().positive(),
      fulfillSiteKind: z.enum(["central_supply", "central_kitchen"]),
      itemIds: z.array(z.coerce.number().int().positive()).min(1),
      reason: z.string().trim().min(5).max(500),
    }),
    permission: PERMISSION_KEYS.INVENTORY_REQUEST_FULFILL,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc(
      "reject_stock_request_lines" as never,
      {
        p_request_id: data.requestId,
        p_fulfill_site_kind: data.fulfillSiteKind,
        p_item_ids: data.itemIds,
        p_reason: data.reason,
      } as never,
    );
    if (error) {
      return mapInventoryRpcFailure(
        error,
        stockRequestRpcMappings,
        stockRequestRpcFallback,
      );
    }
    revalidatePath("/inventory/transfers");
    revalidatePath(`/inventory/stock-requests/${data.requestId}`);
    return { success: true as const };
  },
);

export const fulfillStockRequestLines = withAction(
  {
    roles: STOCK_REQUEST_FULFILL_ROLES,
    schema: z.object({
      requestId: z.coerce.number().int().positive(),
      fulfillSiteKind: z.enum(["central_supply", "central_kitchen"]),
      fromBranchId: z.coerce.number().int().positive(),
      fromLocationId: z.coerce.number().int().positive(),
      itemIds: z.array(z.coerce.number().int().positive()).min(1),
    }),
    permission: PERMISSION_KEYS.INVENTORY_REQUEST_FULFILL,
    permissionBranchId: (data) => data.fromBranchId,
  },
  async (data, { supabase }) => {
    const { data: raw, error } = await supabase.rpc(
      "fulfill_stock_request_lines",
      {
        p_request_id: data.requestId,
        p_fulfill_site_kind: data.fulfillSiteKind,
        p_from_branch_id: data.fromBranchId,
        p_from_location_id: data.fromLocationId,
        p_item_ids: data.itemIds,
      },
    );
    if (error) {
      return mapInventoryRpcFailure(
        error,
        stockRequestRpcMappings,
        stockRequestRpcFallback,
      );
    }
    const row = raw as RpcJson | null;
    const transferId = row?.transfer_id ?? row?.id;
    if (!transferId) {
      return {
        success: false as const,
        error: "Không tạo được phiếu điều chuyển.",
      };
    }
    revalidatePath("/inventory/transfers");
    revalidatePath(`/inventory/stock-requests/${data.requestId}`);
    return { success: true as const, data: { transferId } };
  },
);
