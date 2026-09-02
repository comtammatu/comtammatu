"use server";

import { z } from "zod";
import {
  PERMISSION_KEYS,
  STOCK_REQUEST_FULFILL_ROLES,
  STOCK_REQUEST_ROLES,
} from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";
import { inventoryPositiveQuantitySchema } from "./_lib/inventory-quantity-schema";
import { messages } from "@lib/messages";
import type { ActionResult } from "@comtammatu/shared/types";

function ychWriteFrozen<T = never>(): ActionResult<T> {
  return {
    success: false,
    error: messages.inventory.stockRequests.journey.writeFrozen,
  };
}

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
  async () => ychWriteFrozen<{
    requestId: number;
    requestNumber: string;
    status: "draft" | "submitted";
  }>(),
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
  async () => ychWriteFrozen(),
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
  async () => ychWriteFrozen(),
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
  async () => ychWriteFrozen(),
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
  async () => ychWriteFrozen<{ transferId: number }>(),
);
