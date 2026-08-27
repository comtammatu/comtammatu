"use server";

import { z } from "zod";
import { createClient } from "@comtammatu/database/supabase/server";
import type { ActionResult } from "@comtammatu/shared/types";
import { ORDERS_VI } from "@comtammatu/shared/messages";
import { getAuthContextWithPermission } from "@/_lib/auth";
import { PERMISSION_KEYS, type StaffRole } from "@comtammatu/shared/auth";
import { getVNDayUtcRange } from "@comtammatu/shared/time";
import {
  orderPaymentAttempts,
  type OrderPaymentAttempt,
} from "./_lib/order-payment";

/* ─── Allowed roles ─── */

const ALLOWED_ROLES: StaffRole[] = ["owner", "branch_manager", "cashier"];

/* ─── Schema ─── */

const fetchOrdersSchema = z.object({
  orderId: z.coerce.number().int().positive().optional(),
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

export interface OrderRow {
  id: number;
  order_number: string;
  branch_id: number;
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
  kds_completed_at?: string | null;
  branch_name: string;
  created_by_name: string;
  items: OrderItem[];
  payment: OrderPaymentAttempt | null;
  payment_attempts: OrderPaymentAttempt[];
}

const operationalPaymentSchema = z.object({
  id: z.number(),
  method: z.string(),
  amount: z.number(),
  status: z.string(),
  provider_ref: z.string().nullable(),
  paid_at: z.string().nullable(),
  created_at: z.string(),
  reconciliation_status: z.enum(["matched", "missing", "not_applicable"]),
});

const operationalItemSummarySchema = z.object({
  item_row_count: z.number(),
  item_quantity: z.number(),
  main_dish_quantity: z.number(),
  side_dish_quantity: z.number(),
  included_side_quantity: z.number(),
  served_item_quantity: z.number(),
  legacy_unclassified_quantity: z.number(),
  legacy_current_main_dish_quantity: z.number(),
  legacy_current_side_dish_quantity: z.number(),
});

const operationalKdsEventSchema = z.object({
  id: z.number(),
  event_type: z.string(),
  occurred_at: z.string(),
  actor_name: z.string().nullable(),
  ticket_id: z.number(),
  order_item_id: z.number(),
  station_id: z.number(),
  kitchen_send_batch_id: z.number().nullable(),
  from_status: z.string().nullable(),
  to_status: z.string(),
  reason: z.string().nullable(),
  item_snapshot: z.record(z.string(), z.unknown()),
  context: z.record(z.string(), z.unknown()),
});

const operationalPrintJobSchema = z.object({
  id: z.number(),
  job_type: z.string(),
  printer_id: z.number(),
  status: z.string(),
  attempts: z.number(),
  retry_count: z.number(),
  created_at: z.string(),
  printed_at: z.string().nullable(),
  payload_summary: z.record(z.string(), z.unknown()),
});

const operationalInvoiceSchema = z.object({
  id: z.number(),
  invoice_kind: z.string(),
  status: z.string(),
  invoice_number: z.string().nullable(),
  provider: z.string(),
  provider_ref: z.string().nullable(),
  issued_at: z.string().nullable(),
  created_at: z.string(),
});

const operationalAuditSchema = z.object({
  id: z.number(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.number().nullable(),
  actor_id: z.string().nullable(),
  actor_name: z.string().nullable(),
  created_at: z.string(),
});

const orderOperationalTraceSchema = z.object({
  order_id: z.number(),
  branch_id: z.number(),
  pos_session_id: z.number().nullable(),
  item_summary: operationalItemSummarySchema,
  payments: z.array(operationalPaymentSchema),
  kds_events: z.array(operationalKdsEventSchema),
  print_jobs: z.array(operationalPrintJobSchema),
  tax_invoices: z.array(operationalInvoiceSchema),
  audit_events: z.array(operationalAuditSchema),
});

export type OrderOperationalTrace = z.infer<typeof orderOperationalTraceSchema>;

export type FetchOrdersFilters = {
  orderId?: number;
  status?: string;
  branchId?: number;
  dateFrom?: string;
  dateTo?: string;
};

/**
 * Server-side aggregates over the FULL filtered set (not just the 50-row
 * list window). `paidRevenue` is paid, non-cancelled orders only — unpaid
 * orders are never counted as revenue.
 */
export interface OrdersSummary {
  totalCount: number;
  inProgressCount: number;
  paidCount: number;
  paidRevenue: number;
}

/* ─── Audit log types ─── */

/** Hành động đã được parse từ `order_status_history.note` thành dạng người dùng đọc được. */
type AuditAction =
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

export async function fetchOrders(filters?: FetchOrdersFilters): Promise<
  ActionResult<{
    orders: OrderRow[];
    branches: { id: number; name: string }[];
    summary: OrdersSummary;
  }>
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
       branch_id,
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
       profiles!orders_created_by_fkey(full_name),
       payments(id, method, amount, status, paid_at, created_at),
       kds_tickets(status, first_ready_at, bumped_at)`,
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (parsed.data.orderId) {
    query = query.eq("id", parsed.data.orderId);
  }

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
    return { success: false, error: ORDERS_VI.loadOrdersFailed };
  }

  const orders: OrderRow[] = (data ?? []).map((row) => {
    const { attempts, canonical } = orderPaymentAttempts(
      Array.isArray(row.payments) ? row.payments : [],
    );

    const kdsTickets = Array.isArray(row.kds_tickets)
      ? (row.kds_tickets as Array<{
          status: string;
          first_ready_at: string | null;
          bumped_at: string | null;
        }>)
      : [];
    const activeKdsTickets = kdsTickets.filter((t) => t.status !== "cancelled");
    let kds_completed_at: string | null = null;
    if (
      activeKdsTickets.length > 0 &&
      activeKdsTickets.every(
        (t) => t.status === "ready" || t.status === "served",
      )
    ) {
      const timestamps = activeKdsTickets
        .map((t) => t.first_ready_at || t.bumped_at)
        .filter((ts): ts is string => Boolean(ts));
      if (timestamps.length > 0) {
        kds_completed_at = timestamps.reduce((latest, current) =>
          Date.parse(current) > Date.parse(latest) ? current : latest,
        );
      }
    }

    return {
      id: row.id,
      order_number: row.order_number,
      branch_id: row.branch_id,
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
      kds_completed_at,
      branch_name: (row.branches as { name: string } | null)?.name ?? "—",
      created_by_name:
        (row.profiles as { full_name: string } | null)?.full_name ?? "—",
      items: [],
      payment: canonical,
      payment_attempts: attempts,
    };
  });

  // All four counters over the FULL filtered set (not the 50-row list window)
  // via one SECURITY DEFINER aggregate that checks orders:read/kds:use once,
  // instead of two count-exact scans + an invoker RPC each paying per-row RLS.
  const { data: summaryRows } = await supabase.rpc("get_orders_summary", {
    p_status: parsed.data.status || undefined,
    p_branch_id: effectiveBranchId,
    p_from: parsed.data.dateFrom
      ? getVNDayUtcRange(parsed.data.dateFrom).startIso
      : undefined,
    p_to: parsed.data.dateTo
      ? getVNDayUtcRange(parsed.data.dateTo).endIso
      : undefined,
  });

  const summaryRow = summaryRows?.[0];
  const summary: OrdersSummary = {
    totalCount: Number(summaryRow?.total_count ?? 0),
    inProgressCount: Number(summaryRow?.in_progress_count ?? 0),
    paidCount: Number(summaryRow?.paid_count ?? 0),
    paidRevenue: Number(summaryRow?.paid_revenue ?? 0),
  };

  // Fetch branches list (for filter select — managers see all, branch_manager sees only theirs)
  let branchesData: { id: number; name: string }[] = [];

  if (claims.user_role !== "branch_manager") {
    const branchesRes = await supabase
      .from("branches")
      .select("id, name")
      .eq("is_active", true)
      .eq("branch_kind", "branch")
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

  return {
    success: true,
    data: { orders, branches: branchesData, summary },
  };
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
const ORDER_STATUS_LABELS_VI: Record<string, string> = {
  new: "Mới",
  confirmed: "Đã xác nhận",
  preparing: "Đang làm",
  ready: "Sẵn sàng",
  served: "Đã phục vụ",
  paid: "Đã thanh toán",
  cancelled: "Đã huỷ",
  completed: "Hoàn thành",
};

function orderStatusLabelVi(status: string): string {
  return ORDER_STATUS_LABELS_VI[status] ?? "trạng thái khác";
}

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
      label: `Trạng thái → ${orderStatusLabelVi(toStatus)}`,
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
    const raw = colon > -1 ? note.slice(colon + 1).trim() : null;
    // Prefer human display codes; drop bare order#N machine refs from reason.
    const reason =
      raw && !/^order#\d+$/i.test(raw)
        ? raw.replace(/\border#\d+\b/gi, "").replace(/\(\s*\)/g, "").trim() ||
          null
        : null;
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
    // 'mark_item_served 123' — no reason; the raw note is enough context.
    return { action: "mark_item_served", label: "Phục vụ món", reason: null };
  }

  // cancel_order only writes p_reason → toStatus='cancelled', note is the raw reason.
  if (toStatus === "cancelled") {
    return { action: "cancel", label: "Hủy đơn", reason: note };
  }

  return {
    action: "other",
    label: `Trạng thái → ${orderStatusLabelVi(toStatus)}`,
    reason: note,
  };
}

const ORDERS_READ_ROLES: StaffRole[] = ["owner", "branch_manager", "cashier"];

export async function fetchOrderAuditLog(
  orderId: number,
): Promise<ActionResult<OrderAuditEntry[]>> {
  const parsed = auditOrderIdSchema.safeParse(orderId);
  if (!parsed.success) {
    return { success: false, error: "Mã đơn hàng không hợp lệ" };
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
      error: ORDERS_VI.loadHistoryFailed,
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

/* ─── fetchOrderItems — loaded on demand when the detail sheet opens ─── */

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
    return { success: false, error: "Mã đơn hàng không hợp lệ" };
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
      error: ORDERS_VI.loadItemsFailed,
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

type OrderOperationalTraceRpc = (
  name: "get_order_operational_trace",
  args: { p_order_id: number },
) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

export async function fetchOrderOperationalTrace(
  orderId: number,
): Promise<ActionResult<OrderOperationalTrace>> {
  const parsed = auditOrderIdSchema.safeParse(orderId);
  if (!parsed.success) {
    return { success: false, error: "Mã đơn hàng không hợp lệ" };
  }

  const ctx = await getAuthContextWithPermission(
    ORDERS_READ_ROLES,
    PERMISSION_KEYS.ORDERS_READ,
  );
  if (!ctx) return { success: false, error: "Không có quyền" };
  const { data, error } = await (
    ctx.supabase.rpc as unknown as OrderOperationalTraceRpc
  )("get_order_operational_trace", {
    p_order_id: parsed.data,
  });

  if (error) {
    return {
      success: false,
      error: ORDERS_VI.loadOperationalEvidenceFailed,
    };
  }

  const trace = orderOperationalTraceSchema.safeParse(data);
  if (!trace.success) {
    return {
      success: false,
      error: ORDERS_VI.invalidOperationalEvidence,
    };
  }

  return { success: true, data: trace.data };
}

