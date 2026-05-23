"use server";

import { z } from "zod";
import { createClient } from "@comtammatu/database/supabase/server";
import type { ActionResult } from "@comtammatu/shared/types";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { getVNDayUtcRange } from "@comtammatu/shared/time";

/* ─── Allowed roles ─── */

const ALLOWED_ROLES: StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
  "cashier",
];

/* ─── Schema ─── */

const fetchOrdersSchema = z.object({
  status: z.string().optional(),
  branchId: z.coerce.number().int().positive().optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

/* ─── Types ─── */

/** Snapshot shape khớp `order_items.modifiers` JSONB
 * (migration 20260405070000_create_orders.sql). */
export interface OrderItemModifier {
  modifier_id: number;
  name: string;
  price: number;
}

/** Snapshot shape khớp `order_items.sides` JSONB
 * (migration 20260423200000_pos_order_sides_pricing.sql). */
export interface OrderItemSide {
  side_item_id: number;
  name: string;
  price: number;
  quantity?: number;
  is_default: boolean;
}

export interface OrderItem {
  id: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  variant_name: string | null;
  status: string;
  cancel_reason: string | null;
  note: string | null;
  modifiers: OrderItemModifier[];
  sides: OrderItemSide[];
}

export interface OrderPayment {
  method: string;
  amount: number;
  status: string;
}

export interface OrderRow {
  id: number;
  order_number: string;
  status: string;
  order_type: string;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  service_charge: number;
  total_amount: number;
  payment_method: string | null;
  payment_status: string | null;
  created_at: string;
  branch_name: string;
  created_by_name: string;
  items: OrderItem[];
  payment: OrderPayment | null;
}

export type FetchOrdersFilters = {
  status?: string;
  branchId?: number;
  dateFrom?: string;
  dateTo?: string;
};

/* ─── Audit log types ─── */

/** Hành động đã được parse từ `order_status_history.note` thành dạng người dùng đọc được. */
export type AuditAction =
  | "create"
  | "status_change"
  | "cancel"
  | "void_item"
  | "auto_cancel_voided_all"
  | "discount_apply"
  | "discount_clear"
  | "items_added"
  | "split_to"
  | "split_from"
  | "merged_into"
  | "merged_from"
  | "transfer_table"
  | "edit_item"
  | "mark_item_served"
  | "other";

export interface OrderAuditEntry {
  id: number;
  at: string;
  by_name: string;
  from_status: string | null;
  to_status: string;
  action: AuditAction;
  /** Nhãn ngắn người dùng đọc được, vd "Hủy đơn", "Hủy món", "Áp chiết khấu". */
  label: string;
  /** Lý do / chi tiết bổ sung (hậu tố sau dấu ":" trong note gốc). */
  reason: string | null;
  /** Note gốc, giữ lại để debug khi label="Hành động khác". */
  raw_note: string | null;
}

const auditOrderIdSchema = z.coerce.number().int().positive();

/* ─── Action ─── */

export async function fetchOrders(
  filters?: FetchOrdersFilters,
): Promise<
  ActionResult<{ orders: OrderRow[]; branches: { id: number; name: string }[] }>
> {
  const parsed = fetchOrdersSchema.safeParse(filters ?? {});
  if (!parsed.success) {
    return { success: false, error: "Bộ lọc không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    ALLOWED_ROLES,
    PERMISSION_KEYS.ORDERS_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const { claims } = ctx;
  const supabase = await createClient();

  // branch_manager: auto-filter to their branch
  const effectiveBranchId =
    claims.user_role === "branch_manager"
      ? (claims.branch_id ?? undefined)
      : parsed.data.branchId;

  // Build orders query with joins
  // List view: exclude order_items to keep RSC payload small.
  // Items are loaded on-demand when user opens order detail.
  let query = supabase
    .from("orders")
    .select(
      `id,
       order_number,
       status,
       order_type,
       subtotal,
       tax_amount,
       discount_amount,
       service_charge,
       total_amount,
       payment_method,
       payment_status,
       created_at,
       branches(name),
       profiles(full_name),
       payments(method, amount, status)`,
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (parsed.data.status) {
    query = query.eq("status", parsed.data.status);
  }

  if (effectiveBranchId) {
    query = query.eq("branch_id", effectiveBranchId);
  }

  if (parsed.data.dateFrom) {
    query = query.gte(
      "created_at",
      getVNDayUtcRange(parsed.data.dateFrom).startIso,
    );
  }

  if (parsed.data.dateTo) {
    query = query.lt("created_at", getVNDayUtcRange(parsed.data.dateTo).endIso);
  }

  const { data, error } = await query;

  if (error) {
    return { success: false, error: "Không thể tải đơn hàng" };
  }

  const orders: OrderRow[] = (data ?? []).map((row) => {
    const paymentsArr = Array.isArray(row.payments) ? row.payments : [];
    const firstPayment = paymentsArr[0];

    return {
      id: row.id,
      order_number: row.order_number,
      status: row.status,
      order_type: row.order_type,
      subtotal: row.subtotal,
      tax_amount: row.tax_amount,
      discount_amount: row.discount_amount,
      service_charge: row.service_charge,
      total_amount: row.total_amount,
      payment_method: row.payment_method,
      payment_status: row.payment_status,
      created_at: row.created_at,
      branch_name: (row.branches as { name: string } | null)?.name ?? "—",
      created_by_name:
        (row.profiles as { full_name: string } | null)?.full_name ?? "—",
      items: [],
      payment: firstPayment
        ? {
            method: firstPayment.method,
            amount: firstPayment.amount,
            status: firstPayment.status,
          }
        : null,
    };
  });

  // Fetch branches list (for filter select — managers see all, branch_manager sees only theirs)
  let branchesData: { id: number; name: string }[] = [];

  if (claims.user_role !== "branch_manager") {
    const branchesRes = await supabase
      .from("branches")
      .select("id, name")
      .eq("is_active", true)
      .order("name");

    branchesData = branchesRes.data ?? [];
  } else if (claims.branch_id != null) {
    const branchRes = await supabase
      .from("branches")
      .select("id, name")
      .eq("id", claims.branch_id)
      .single();
    if (branchRes.data) {
      branchesData = [branchRes.data];
    }
  }

  return { success: true, data: { orders, branches: branchesData } };
}

/* ─── fetchOrderAuditLog — timeline cho admin order detail ─── */

/**
 * Parse `order_status_history.note` thành nhãn người-đọc-được. Các convention
 * note đến từ các RPC sau (đã grep migrations 20260405-20260513):
 *   - create_order:           note=NULL,   to_status='new'
 *   - cancel_order:           note=<reason>
 *   - void_order_item:        note='void_item <id>: <reason>'
 *   - void_order_item all:    note='auto_cancel_all_items_voided: <reason>'
 *   - apply_order_discount:   note='discount_applied: pct 10 (5000đ) :: <reason>'
 *   - clear_order_discount:   note='discount_cleared (was Xđ)'
 *   - append_order_items:     note='items_added: <comma-sep names>'
 *   - split_order (source):   note='split_to: TC-... (moved N units across M lines)'
 *   - split_order (new):      note='split_from: order#N'
 *   - merge_orders, transfer_table, etc. fall through to "other"
 */
function parseAuditNote(
  note: string | null,
  toStatus: string,
  fromStatus: string | null,
): Pick<OrderAuditEntry, "action" | "label" | "reason"> {
  if (note == null) {
    if (fromStatus == null && toStatus === "new") {
      return { action: "create", label: "Tạo đơn", reason: null };
    }
    return {
      action: "status_change",
      label: `Trạng thái → ${toStatus}`,
      reason: null,
    };
  }

  if (note.startsWith("void_item ")) {
    // 'void_item 123: reason text'
    const colon = note.indexOf(":");
    const reason = colon > -1 ? note.slice(colon + 1).trim() : null;
    return { action: "void_item", label: "Hủy món", reason };
  }

  if (note.startsWith("auto_cancel_all_items_voided")) {
    const colon = note.indexOf(":");
    const reason = colon > -1 ? note.slice(colon + 1).trim() : null;
    return {
      action: "auto_cancel_voided_all",
      label: "Tự hủy đơn (do hủy hết món)",
      reason,
    };
  }

  if (note.startsWith("discount_applied")) {
    // 'discount_applied: pct 10 (5000đ) :: reason'
    const dblColon = note.indexOf("::");
    const reason = dblColon > -1 ? note.slice(dblColon + 2).trim() : null;
    const meta =
      dblColon > -1
        ? note.slice(note.indexOf(":") + 1, dblColon).trim()
        : note.slice(note.indexOf(":") + 1).trim();
    return {
      action: "discount_apply",
      label: `Áp chiết khấu (${meta})`,
      reason,
    };
  }

  if (note.startsWith("discount_cleared")) {
    return { action: "discount_clear", label: "Bỏ chiết khấu", reason: null };
  }

  if (note.startsWith("items_added")) {
    const colon = note.indexOf(":");
    const reason = colon > -1 ? note.slice(colon + 1).trim() : null;
    return { action: "items_added", label: "Thêm món", reason };
  }

  if (note.startsWith("split_to")) {
    const colon = note.indexOf(":");
    const reason = colon > -1 ? note.slice(colon + 1).trim() : null;
    return { action: "split_to", label: "Tách đơn", reason };
  }

  if (note.startsWith("split_from")) {
    const colon = note.indexOf(":");
    const reason = colon > -1 ? note.slice(colon + 1).trim() : null;
    return {
      action: "split_from",
      label: "Tách từ đơn khác",
      reason,
    };
  }

  if (note.startsWith("merged_into")) {
    // 'merged_into: TC-... (#N), moved X items'
    const colon = note.indexOf(":");
    const reason = colon > -1 ? note.slice(colon + 1).trim() : null;
    return { action: "merged_into", label: "Gộp vào đơn khác", reason };
  }

  if (note.startsWith("merged_from")) {
    // 'merged_from: TC-... (#N), received X items'
    const colon = note.indexOf(":");
    const reason = colon > -1 ? note.slice(colon + 1).trim() : null;
    return { action: "merged_from", label: "Nhận từ đơn khác", reason };
  }

  if (note.startsWith("transfer_table")) {
    // 'transfer_table -> 12'
    const arrow = note.indexOf("->");
    const reason = arrow > -1 ? `Bàn ${note.slice(arrow + 2).trim()}` : null;
    return { action: "transfer_table", label: "Chuyển bàn", reason };
  }

  if (note.startsWith("edit_item ")) {
    // 'edit_item 123: qty 2->3, unit 65000->70000'
    const colon = note.indexOf(":");
    const reason = colon > -1 ? note.slice(colon + 1).trim() : null;
    return { action: "edit_item", label: "Sửa món", reason };
  }

  if (note.startsWith("mark_item_served ")) {
    // 'mark_item_served 123' — không có lý do, raw_note đã đủ context.
    return { action: "mark_item_served", label: "Phục vụ món", reason: null };
  }

  // cancel_order chỉ ghi p_reason → toStatus='cancelled', note là raw reason.
  if (toStatus === "cancelled") {
    return { action: "cancel", label: "Hủy đơn", reason: note };
  }

  return {
    action: "other",
    label: `Trạng thái → ${toStatus}`,
    reason: note,
  };
}

const ORDERS_READ_ROLES: StaffRole[] = [
  "owner",
  "super_manager",
  "area_manager",
  "branch_manager",
  "cashier",
];

export async function fetchOrderAuditLog(
  orderId: number,
): Promise<ActionResult<OrderAuditEntry[]>> {
  const parsed = auditOrderIdSchema.safeParse(orderId);
  if (!parsed.success) {
    return { success: false, error: "Order ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    ORDERS_READ_ROLES,
    PERMISSION_KEYS.ORDERS_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("order_status_history")
    .select(
      `id, created_at, from_status, to_status, note,
       profiles!order_status_history_changed_by_fkey(full_name)`,
    )
    .eq("order_id", parsed.data)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    return {
      success: false,
      error: "Không thể tải lịch sử thao tác. Vui lòng thử lại.",
    };
  }

  const entries: OrderAuditEntry[] = (data ?? []).map((row) => {
    const parsedNote = parseAuditNote(
      row.note ?? null,
      row.to_status,
      row.from_status,
    );
    return {
      id: row.id,
      at: row.created_at,
      by_name: (row.profiles as { full_name: string } | null)?.full_name ?? "—",
      from_status: row.from_status,
      to_status: row.to_status,
      action: parsedNote.action,
      label: parsedNote.label,
      reason: parsedNote.reason,
      raw_note: row.note,
    };
  });

  return { success: true, data: entries };
}

/* ─── fetchOrderItems — load on-demand khi mở order detail sheet ─── */

/**
 * List view (`fetchOrders`) cố tình bỏ items để giữ RSC payload nhỏ. Sheet
 * gọi action này khi mở để fetch riêng. RLS `order_items_select` join qua
 * `orders.branch_id` + `has_permission(branch_id, 'orders:read')` đã enforce
 * branch scope — không cần explicit filter ở đây.
 *
 * Không return raw error.message ra client. `cancel_reason` có thể chứa text
 * tiếng Việt — UI render nguyên dạng.
 */
export async function fetchOrderItems(
  orderId: number,
): Promise<ActionResult<OrderItem[]>> {
  const parsed = auditOrderIdSchema.safeParse(orderId);
  if (!parsed.success) {
    return { success: false, error: "Order ID không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    ORDERS_READ_ROLES,
    PERMISSION_KEYS.ORDERS_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("order_items")
    .select(
      "id, item_name, variant_name, quantity, unit_price, subtotal, status, cancel_reason, note, modifiers, sides",
    )
    .eq("order_id", parsed.data)
    .order("id", { ascending: true });

  if (error) {
    return {
      success: false,
      error: "Không thể tải món của đơn. Vui lòng thử lại.",
    };
  }

  const items: OrderItem[] = (data ?? []).map((row) => ({
    id: row.id,
    item_name: row.item_name,
    variant_name: row.variant_name,
    quantity: row.quantity,
    unit_price: row.unit_price,
    subtotal: row.subtotal,
    status: row.status,
    cancel_reason: row.cancel_reason,
    note: row.note,
    modifiers: Array.isArray(row.modifiers)
      ? (row.modifiers as unknown as OrderItemModifier[])
      : [],
    sides: Array.isArray(row.sides)
      ? (row.sides as unknown as OrderItemSide[])
      : [],
  }));

  return { success: true, data: items };
}
