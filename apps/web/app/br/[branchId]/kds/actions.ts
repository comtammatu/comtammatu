"use server";

import { z } from "zod";
import { MODULE_ACL } from "@comtammatu/shared/auth";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContext } from "../../_lib/auth";

const KDS_ROLES = MODULE_ACL.kds.allowedRoles;

const branchIdSchema = z.coerce
  .number()
  .int()
  .positive({ error: "Branch ID không hợp lệ" });

/* ─── fetchKdsStations ─── */

/**
 * Fetch KDS stations for a branch, with their assigned categories.
 */
export async function fetchKdsStations(
  branchId: number,
): Promise<ActionResult> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const ctx = await getAuthContext(KDS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (claims.branch_id !== parsedBranchId.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  const { data: stations, error } = await supabase
    .from("kds_stations")
    .select(
      `
      id,
      name,
      sort_order,
      is_active,
      kds_station_categories (
        id,
        category_id
      )
    `,
    )
    .eq("branch_id", parsedBranchId.data)
    .eq("tenant_id", claims.tenant_id)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return {
      success: false,
      error: "Không thể tải danh sách trạm bếp. Vui lòng thử lại.",
    };
  }

  return { success: true, data: stations ?? [] };
}

/* ─── fetchKdsQueue ─── */

/**
 * Fetch pending/preparing order items for a KDS station.
 * Derives queue from order_items + station category mapping.
 */
export async function fetchKdsQueue(
  branchId: number,
  stationId: number,
): Promise<ActionResult> {
  const parsedBranchId = branchIdSchema.safeParse(branchId);
  if (!parsedBranchId.success) {
    return { success: false, error: "Branch ID không hợp lệ" };
  }

  const stationIdSchema = z.coerce.number().int().positive();
  const parsedStationId = stationIdSchema.safeParse(stationId);
  if (!parsedStationId.success) {
    return { success: false, error: "Station ID không hợp lệ" };
  }

  const ctx = await getAuthContext(KDS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase, claims } = ctx;

  if (claims.branch_id !== parsedBranchId.data) {
    return { success: false, error: "Không có quyền truy cập chi nhánh này" };
  }

  // Get category IDs for this station
  const { data: stationCats, error: catError } = await supabase
    .from("kds_station_categories")
    .select("category_id")
    .eq("station_id", parsedStationId.data)
    .eq("tenant_id", claims.tenant_id);

  if (catError) {
    return { success: false, error: "Không thể tải cấu hình trạm bếp." };
  }

  const categoryIds = (stationCats ?? []).map((c) => c.category_id);

  if (categoryIds.length === 0) {
    return { success: true, data: [] };
  }

  // Fetch order items that belong to these categories and are active
  const { data: items, error: itemError } = await supabase
    .from("order_items")
    .select(
      `
      id,
      order_id,
      item_name,
      variant_name,
      quantity,
      modifiers,
      sides,
      note,
      status,
      created_at,
      menu_item_id,
      menu_items!inner (
        category_id
      ),
      orders!inner (
        order_number,
        order_type,
        table_id,
        status,
        created_at,
        tables (
          number
        )
      )
    `,
    )
    .eq("tenant_id", claims.tenant_id)
    .eq("orders.branch_id", parsedBranchId.data)
    .in("status", ["pending", "preparing"])
    .in("menu_items.category_id", categoryIds)
    .not("orders.status", "in", '("completed","cancelled")')
    .order("created_at", { ascending: true });

  if (itemError) {
    return {
      success: false,
      error: "Không thể tải danh sách món. Vui lòng thử lại.",
    };
  }

  return { success: true, data: items ?? [] };
}

/* ─── bumpItem ─── */

/**
 * Bump an order item to the next status via transition RPC.
 * pending → preparing → ready
 */
export async function bumpItem(
  itemId: number,
  currentStatus: string,
): Promise<ActionResult> {
  const itemIdSchema = z.coerce.number().int().positive();
  const parsedItemId = itemIdSchema.safeParse(itemId);
  if (!parsedItemId.success) {
    return { success: false, error: "Item ID không hợp lệ" };
  }

  const ctx = await getAuthContext(KDS_ROLES);
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { supabase } = ctx;

  // Determine next status
  let nextStatus: string;
  if (currentStatus === "pending") {
    nextStatus = "preparing";
  } else if (currentStatus === "preparing") {
    nextStatus = "ready";
  } else {
    return { success: false, error: "Không thể chuyển trạng thái từ " + currentStatus };
  }

  const { data, error } = await (supabase.rpc as CallableFunction)(
    "transition_order_item_status",
    {
      p_item_id: parsedItemId.data,
      p_new_status: nextStatus,
      p_expected_status: currentStatus,
    },
  );

  if (error) {
    if (error.message?.includes("status_changed")) {
      return {
        success: false,
        error: "Trạng thái đã thay đổi. Vui lòng tải lại.",
      };
    }
    if (error.message?.includes("invalid_transition")) {
      return { success: false, error: "Không thể chuyển trạng thái này." };
    }
    return {
      success: false,
      error: "Không thể cập nhật. Vui lòng thử lại.",
    };
  }

  return { success: true, data };
}

/* ─── recallItem ─── */

/**
 * Recall (undo bump): move item back one status.
 * preparing → pending, ready → preparing
 * This is a convenience for kitchen corrections.
 */
export async function recallItem(
  _itemId: number,
  _currentStatus: string,
): Promise<ActionResult> {
  // The transition RPC only allows forward transitions.
  // For recall, we need a direct update. Only branch_manager should do this.
  // TODO: Add recall support to transition_order_item_status if needed.
  return {
    success: false,
    error: "Chức năng thu hồi chưa được hỗ trợ.",
  };
}
