"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  PERMISSION_KEYS,
  STOCK_REQUEST_FULFILL_ROLES,
  STOCK_REQUEST_ROLES,
} from "@comtammatu/shared/auth";
import { withAction } from "@/_lib/with-action";

function mapStockRequestRpcError(code: string | undefined, message?: string): string {
  const msg = message ?? "";
  if (msg.includes("ingredient_fulfill_site_required")) {
    return "Nguyên liệu chưa gán nguồn Kho Tổng / Bếp TT.";
  }
  if (msg.includes("stock_request_empty")) {
    return "Phiếu yêu cầu cần ít nhất một dòng.";
  }
  switch (code) {
    case "42501":
      return "Không có quyền thực hiện trên phiếu yêu cầu hàng.";
    case "P0002":
      return "Không tìm thấy phiếu yêu cầu.";
    default:
      return "Không thể hoàn tất yêu cầu hàng.";
  }
}

type RpcJson = {
  request_id?: number;
  request_number?: string;
  item_id?: number;
  fulfill_site_kind?: string;
  transfer_id?: number;
  id?: number;
};

export const createStockRequestDraft = withAction(
  {
    roles: STOCK_REQUEST_ROLES,
    schema: z.object({
      branchId: z.coerce.number().int().positive(),
      notes: z.string().max(500).optional(),
    }),
    permission: PERMISSION_KEYS.INVENTORY_REQUEST_CREATE,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase }) => {
    const { data: raw, error } = await supabase.rpc("create_stock_request_draft", {
      p_branch_id: data.branchId,
      p_notes: data.notes,
    });
    if (error) {
      return {
        success: false as const,
        error: mapStockRequestRpcError(error.code, error.message),
      };
    }
    const row = raw as RpcJson | null;
    if (!row?.request_id || !row.request_number) {
      return { success: false as const, error: "Không tạo được phiếu yêu cầu." };
    }
    revalidatePath(`/br/${data.branchId}/stock/requests`);
    return {
      success: true as const,
      data: {
        requestId: row.request_id,
        requestNumber: row.request_number,
      },
    };
  },
);

export const addStockRequestLine = withAction(
  {
    roles: STOCK_REQUEST_ROLES,
    schema: z.object({
      branchId: z.coerce.number().int().positive(),
      requestId: z.coerce.number().int().positive(),
      ingredientId: z.coerce.number().int().positive(),
      entryUnitId: z.coerce.number().int().positive(),
      quantity: z.coerce.number().positive(),
    }),
    permission: PERMISSION_KEYS.INVENTORY_REQUEST_CREATE,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase }) => {
    const { data: raw, error } = await supabase.rpc("add_stock_request_line", {
      p_request_id: data.requestId,
      p_ingredient_id: data.ingredientId,
      p_entry_unit_id: data.entryUnitId,
      p_quantity: data.quantity,
    });
    if (error) {
      return {
        success: false as const,
        error: mapStockRequestRpcError(error.code, error.message),
      };
    }
    const row = raw as RpcJson | null;
    if (!row?.item_id || !row.fulfill_site_kind) {
      return { success: false as const, error: "Không thêm được dòng." };
    }
    revalidatePath(`/br/${data.branchId}/stock/requests`);
    revalidatePath(`/br/${data.branchId}/stock/requests/${data.requestId}`);
    return {
      success: true as const,
      data: {
        itemId: row.item_id,
        fulfillSiteKind: row.fulfill_site_kind,
      },
    };
  },
);

export const submitStockRequest = withAction(
  {
    roles: STOCK_REQUEST_ROLES,
    schema: z.object({
      branchId: z.coerce.number().int().positive(),
      requestId: z.coerce.number().int().positive(),
    }),
    permission: PERMISSION_KEYS.INVENTORY_REQUEST_SUBMIT,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("submit_stock_request", {
      p_request_id: data.requestId,
    });
    if (error) {
      return {
        success: false as const,
        error: mapStockRequestRpcError(error.code, error.message),
      };
    }
    revalidatePath(`/br/${data.branchId}/stock/requests`);
    revalidatePath(`/inventory/stock-requests`);
    return { success: true as const };
  },
);

export const cancelStockRequest = withAction(
  {
    roles: STOCK_REQUEST_ROLES,
    schema: z.object({
      branchId: z.coerce.number().int().positive(),
      requestId: z.coerce.number().int().positive(),
    }),
    permission: PERMISSION_KEYS.INVENTORY_REQUEST_CANCEL,
    permissionBranchId: (data) => data.branchId,
    requireBranchScope: true,
  },
  async (data, { supabase }) => {
    const { error } = await supabase.rpc("cancel_stock_request", {
      p_request_id: data.requestId,
    });
    if (error) {
      return {
        success: false as const,
        error: mapStockRequestRpcError(error.code, error.message),
      };
    }
    revalidatePath(`/br/${data.branchId}/stock/requests`);
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
      return {
        success: false as const,
        error: mapStockRequestRpcError(error.code, error.message),
      };
    }
    const row = raw as RpcJson | null;
    const transferId = row?.transfer_id ?? row?.id;
    if (!transferId) {
      return {
        success: false as const,
        error: "Không tạo được phiếu điều chuyển.",
      };
    }
    revalidatePath("/inventory/stock-requests");
    revalidatePath(`/inventory/stock-requests/${data.requestId}`);
    revalidatePath("/inventory/transfers");
    return { success: true as const, data: { transferId } };
  },
);
