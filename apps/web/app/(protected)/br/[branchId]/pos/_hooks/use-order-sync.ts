"use client";

import { useEffect, useRef } from "react";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import {
  REALTIME_DEGRADED_POLL_MS,
  realtimeHealthFromStatus,
  shouldRunRealtimeFallback,
  type RealtimeChannelHealth,
} from "@/_utils/realtime-health";
import {
  playOperationalAlert,
  shouldAnnouncePaymentReceived,
  type OperationalAudioMode,
} from "@lib/operational-audio";
import { triggerHapticFeedback } from "@lib/haptic-feedback";
import { toast } from "@comtammatu/ui/components/sonner";
import { getVNDateString } from "@comtammatu/shared/time";
import type { BranchTable } from "../page";
import type { SessionOrder } from "../order-history";
import {
  isClosedPosSessionUpdate,
  isCurrentDailyLimitRealtimeEvent,
} from "../_lib/pos-idle-realtime";
import type { PrintJobChangePayload } from "./use-print-job-alerts";

export interface UseOrderSyncArgs {
  branchId: number;
  setTables: React.Dispatch<React.SetStateAction<BranchTable[]>>;
  setOrders: React.Dispatch<React.SetStateAction<SessionOrder[]>>;
  /**
   * Returns the latest tables snapshot. Used to resolve `tables.number`
   * for ORDERS INSERT payloads, since `postgres_changes` carries only
   * the row's own columns (no joins) — without this, an optimistic
   * insert would render `Bàn —` until the deduped fetch fallback returns.
   */
  getTables: () => BranchTable[];
  /**
   * Returns the current active orders snapshot so realtime handlers can
   * classify state transitions before mutating the provider state.
   */
  getOrders: () => SessionOrder[];
  /**
   * Fire-and-forget refresh of the active orders list. MUST already
   * be deduped by the caller — used as a fallback after optimistic
   * INSERT (the optimistic mapping may miss fields the server query
   * applies) and as a safety net on UPDATE/DELETE when the payload
   * doesn't carry the row id.
   */
  refreshOrders: () => void;
  /**
   * Fire-and-forget full refresh (orders + tables). Also caller-deduped.
   * Invoked on SUBSCRIBED-reconnect and the stale visibility poll.
   */
  refreshAll: () => void;
  /**
   * Fired when an existing order flips into a terminal state (paid /
   * completed / cancelled). The provider bumps a token; the archived
   * sheet's pagination hook listens and resets to page 1. Active list
   * itself is patched independently — this callback does NOT replace
   * the active-side state mutation.
   */
  onArchivedInvalidate?: () => void;
  /** Device-local POS audio mode. Routine transitions remain beep-only. */
  audioMode?: OperationalAudioMode;
  /**
   * When true, the FIRST `SUBSCRIBED` callback (initial mount subscription)
   * does not fire a catch-up refresh — orders are already seeded by the
   * caller (e.g. via RSC prefetch). Later SUBSCRIBED events (genuine
   * reconnects) always refresh to catch missed events during disconnect.
   */
  skipFirstSubscribedRefresh?: boolean;
  /**
   * Deduped daily-limit refetch. Attached to this channel so idle POS does
   * not open a second daily-limits JOIN.
   */
  refreshLimits?: () => void;
  /** Open session row this terminal is bound to. */
  sessionId?: number;
  /**
   * Fired only on `pos_sessions` UPDATE to `closed` for `sessionId`.
   * Reconnect must not call this — a missed close self-heals on submit
   * (`SCOPE_SESSION_NOT_OPEN`) without an RSC refresh storm.
   */
  onSessionClosed?: () => void;
  /** Print-job failure toast/audio. Same idle POS JOIN — no dedicated print channel. */
  onPrintJobUpdate?: (payload: PrintJobChangePayload) => void;
  /** Reconnect sweep for print failures missed during disconnect. */
  onPrintReconnect?: () => void;
}

function getOrderContextDescription(order: {
  order_type?: unknown;
  tables?: { number: number } | null;
  table_id?: unknown;
}): string {
  if (order.order_type === "dine_in") {
    const tableNumber = order.tables?.number;
    if (typeof tableNumber === "number") return `Bàn ${String(tableNumber)}`;
    if (typeof order.table_id === "number")
      return `Bàn ${String(order.table_id)}`;
    return "Tại bàn";
  }
  if (order.order_type === "takeaway") return "Mang về";
  if (order.order_type === "delivery") return "Giao hàng";
  return "Đơn POS";
}

function getStringField(
  row: Record<string, unknown>,
  field: string,
): string | null {
  const value = row[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function getNotificationMetaString(
  meta: unknown,
  field: string,
): string | null {
  if (meta === null || typeof meta !== "object") return null;
  const value = (meta as Record<string, unknown>)[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function notifyOutOfStock(
  notification: Record<string, unknown>,
  audioMode: OperationalAudioMode,
  branchId?: number,
): void {
  const title = getStringField(notification, "title") ?? "Bếp báo hết món";
  const itemName =
    getNotificationMetaString(notification.meta, "item_name") ??
    getStringField(notification, "body") ??
    "Cần kiểm tra đơn POS";
  const actionUrl = getStringField(notification, "action_url");

  playOperationalAlert({
    kind: "pos.out_of_stock",
    mode: audioMode,
    branchId,
  });
  toast.warning(title, {
    description: itemName,
    action: actionUrl
      ? {
          label: "Mở đơn",
          onClick: () => {
            window.location.assign(actionUrl);
          },
        }
      : undefined,
  });
}

function notifyOrderTransition(
  currentOrder: SessionOrder | undefined,
  next: Record<string, unknown>,
  audioMode: OperationalAudioMode,
  branchId?: number,
): void {
  if (!currentOrder) return;

  const orderNumber =
    getStringField(next, "order_number") ?? currentOrder.order_number;
  const nextStatus = getStringField(next, "status");
  const nextPaymentStatus = getStringField(next, "payment_status");

  if (nextPaymentStatus === "paid" && currentOrder.payment_status !== "paid") {
    const paymentMethod =
      getStringField(next, "payment_method") ?? currentOrder.payment_method;
    if (shouldAnnouncePaymentReceived(paymentMethod)) {
      const tableNumber = currentOrder.tables?.number;
      playOperationalAlert({
        kind: "pos.payment_received",
        mode: audioMode,
        branchId,
        slots: {
          tableLabel:
            typeof tableNumber === "number" ? String(tableNumber) : undefined,
          amountVnd:
            coerceMoney(next.total_amount) ?? currentOrder.total_amount,
        },
      });
    }
    return;
  }

  // Kitchen bumps order to ready: trigger haptic feedback on mobile/PDA
  // and show table context toast for staff to run the food to the table.
  if (nextStatus === "ready" && currentOrder.status !== "ready") {
    triggerHapticFeedback("success");
    const tableDesc = getOrderContextDescription(currentOrder);
    toast.success(`Bếp hoàn thành #${orderNumber} (${tableDesc})`, {
      description: "Món đã xong — có thể thanh toán",
    });
    return;
  }

  if (nextStatus === "cancelled" && currentOrder.status !== "cancelled") {
    toast.warning(`Đơn #${orderNumber} đã hủy`, {
      description: getOrderContextDescription(currentOrder),
    });
  }
}

// Coerce a NUMERIC payload field to a number, returning null when the value
// is null/undefined. supabase-realtime stringifies NUMERIC over the wire
// (e.g. "165000.00") so always wrap in Number().
function coerceMoney(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

// Coerce a nullable string column. Returns `undefined` when payload doesn't
// carry the field, `null` when explicit null, the string itself otherwise —
// caller distinguishes "patch absent" from "patch to null".
function coerceNullableString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

function coerceNullableNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

// Realtime payload row carries only orders-table columns (no join). Spreading
// raw row over a SessionOrder would leak unknown fields, so we project only
// the SessionOrder shape and coerce numeric/text variants supabase-realtime
// stringifies (e.g. NUMERIC → string). When `table_id` shifts (e.g. POS
// `transfer_order_table` table merge), we resolve `tables.number` from the
// cached tables snapshot so the sidebar's `Bàn X` label flips with the
// new table instead of pinning the stale JOIN from `current`.
//
// REPLICA IDENTITY FULL on `public.orders` (migration 20260425024802) ensures
// every UPDATE payload carries the entire row — patches below trust that
// invariant. If a future migration sets identity back to DEFAULT, only-changed
// columns would arrive and total/discount/service patches could silently miss
// → regression test `applyOrderUpdate handles partial payload` documents that.
function applyOrderUpdate(
  current: SessionOrder,
  payload: Record<string, unknown>,
  tables: BranchTable[],
): SessionOrder {
  const next: SessionOrder = { ...current };
  if (typeof payload.order_number === "string")
    next.order_number = payload.order_number;
  if (typeof payload.order_type === "string")
    next.order_type = payload.order_type;
  if (typeof payload.status === "string") next.status = payload.status;
  if (typeof payload.is_priority === "boolean")
    next.is_priority = payload.is_priority;

  const paymentStatus = coerceNullableString(payload.payment_status);
  if (paymentStatus !== undefined) next.payment_status = paymentStatus;

  const paymentMethod = coerceNullableString(payload.payment_method);
  if (paymentMethod !== undefined) next.payment_method = paymentMethod;

  const deliveryPlatform = coerceNullableString(payload.delivery_platform);
  if (deliveryPlatform !== undefined) next.delivery_platform = deliveryPlatform;

  const externalOrderRef = coerceNullableString(payload.external_order_ref);
  if (externalOrderRef !== undefined)
    next.external_order_ref = externalOrderRef;

  const subtotal = coerceMoney(payload.subtotal);
  if (subtotal !== null) next.subtotal = subtotal;

  const taxAmount = coerceMoney(payload.tax_amount);
  if (taxAmount !== null) next.tax_amount = taxAmount;

  const serviceCharge = coerceMoney(payload.service_charge);
  if (serviceCharge !== null) next.service_charge = serviceCharge;

  const totalAmount = coerceMoney(payload.total_amount);
  if (totalAmount !== null) next.total_amount = totalAmount;

  // Discount metadata is paired (CHECK orders_discount_metadata_paired). Patch
  // all four fields atomically when ANY of them is present in the payload to
  // avoid a half-applied state where amount=0 but type/value linger from a
  // prior apply (mirror rule POS-DISCOUNT-CLEAR-METADATA-WHEN-AMOUNT-ZERO).
  const hasDiscountField =
    "discount_amount" in payload ||
    "order_discount_amount" in payload ||
    "item_discount_amount" in payload ||
    "discount_type" in payload ||
    "discount_value" in payload ||
    "discount_note" in payload;
  if (hasDiscountField) {
    const discountAmount = coerceMoney(payload.discount_amount);
    next.discount_amount = discountAmount ?? 0;
    const orderDiscountAmount = coerceMoney(payload.order_discount_amount);
    if (orderDiscountAmount !== null) {
      next.order_discount_amount = orderDiscountAmount;
    }
    const itemDiscountAmount = coerceMoney(payload.item_discount_amount);
    if (itemDiscountAmount !== null) {
      next.item_discount_amount = itemDiscountAmount;
    }
    if ((next.order_discount_amount ?? 0) > 0) {
      const discountType = coerceNullableString(payload.discount_type);
      if (discountType !== undefined) next.discount_type = discountType;
      const discountValue = coerceNullableNumber(payload.discount_value);
      if (discountValue !== undefined) next.discount_value = discountValue;
      const discountNote = coerceNullableString(payload.discount_note);
      if (discountNote !== undefined) next.discount_note = discountNote;
    } else {
      next.discount_type = null;
      next.discount_value = null;
      next.discount_note = null;
    }
  }

  const note = coerceNullableString(payload.note);
  if (note !== undefined) next.note = note;

  const mergedInto = coerceNullableNumber(payload.merged_into_order_id);
  if (mergedInto !== undefined) next.merged_into_order_id = mergedInto;

  const splitFrom = coerceNullableNumber(payload.split_from_order_id);
  if (splitFrom !== undefined) next.split_from_order_id = splitFrom;

  if (payload.table_id === null) {
    next.table_id = null;
    next.tables = null;
  } else if (typeof payload.table_id === "number") {
    next.table_id = payload.table_id;
    if (payload.table_id !== current.table_id) {
      const found = tables.find((t) => t.id === payload.table_id);
      next.tables = found ? { number: found.number } : null;
    }
  }
  if (typeof payload.created_at === "string")
    next.created_at = payload.created_at;
  if (typeof payload.updated_at === "string")
    next.updated_at = payload.updated_at;
  return next;
}

function buildOptimisticOrder(
  payload: Record<string, unknown>,
  tables: BranchTable[],
): SessionOrder | null {
  const id = typeof payload.id === "number" ? payload.id : Number(payload.id);
  if (!Number.isFinite(id)) return null;

  const tableId =
    payload.table_id === null
      ? null
      : typeof payload.table_id === "number"
        ? payload.table_id
        : Number(payload.table_id);
  const safeTableId =
    typeof tableId === "number" && Number.isFinite(tableId) ? tableId : null;
  const tableNumber =
    safeTableId !== null
      ? (tables.find((t) => t.id === safeTableId)?.number ?? null)
      : null;

  // Discount metadata defaults to fully-cleared shape — INSERT for a new
  // order can't reference a prior discount apply (paired CHECK enforces it
  // server-side). When the dedup fallback fetch lands the authoritative row
  // the metadata, if any, replaces these defaults atomically via setOrders.
  const discountAmount = Number(payload.discount_amount ?? 0);
  const orderDiscountAmount = Number(
    payload.order_discount_amount ?? discountAmount,
  );
  const itemDiscountAmount = Number(payload.item_discount_amount ?? 0);
  const hasOrderDiscount = orderDiscountAmount > 0;

  return {
    id,
    order_number: String(payload.order_number ?? ""),
    order_type: String(payload.order_type ?? ""),
    status: String(payload.status ?? "new"),
    payment_status:
      payload.payment_status === null
        ? null
        : typeof payload.payment_status === "string"
          ? payload.payment_status
          : null,
    payment_method:
      typeof payload.payment_method === "string"
        ? payload.payment_method
        : null,
    delivery_platform:
      typeof payload.delivery_platform === "string"
        ? payload.delivery_platform
        : null,
    external_order_ref:
      typeof payload.external_order_ref === "string"
        ? payload.external_order_ref
        : null,
    subtotal: Number(payload.subtotal ?? 0),
    tax_amount: Number(payload.tax_amount ?? 0),
    service_charge: Number(payload.service_charge ?? 0),
    discount_amount: discountAmount,
    order_discount_amount: orderDiscountAmount,
    item_discount_amount: itemDiscountAmount,
    discount_type:
      hasOrderDiscount && typeof payload.discount_type === "string"
        ? payload.discount_type
        : null,
    discount_value: hasOrderDiscount
      ? (coerceNullableNumber(payload.discount_value) ?? null)
      : null,
    discount_note:
      hasOrderDiscount && typeof payload.discount_note === "string"
        ? payload.discount_note
        : null,
    total_amount: Number(payload.total_amount ?? 0),
    table_id: safeTableId,
    note: typeof payload.note === "string" ? payload.note : null,
    is_priority: payload.is_priority === true,
    merged_into_order_id:
      coerceNullableNumber(payload.merged_into_order_id) ?? null,
    split_from_order_id:
      coerceNullableNumber(payload.split_from_order_id) ?? null,
    created_at:
      typeof payload.created_at === "string"
        ? payload.created_at
        : new Date().toISOString(),
    updated_at:
      typeof payload.updated_at === "string"
        ? payload.updated_at
        : new Date().toISOString(),
    tables: tableNumber !== null ? { number: tableNumber } : null,
  };
}

// Current transport: one `pos-branch-{id}` postgres_changes JOIN for orders,
// tables, KDS out-of-stock notifications, daily limits, session close, and
// print-job failures. Branch-scoped via URL branchId. Payload patches stay
// on this channel — do not replace them with broadcast-only invalidation.
//
// Auth-await + setAuth-before-subscribe lives in `useRealtimeChannel` so this
// hook (and every other realtime sub in the app) doesn't repeat the dance.
//
// Orders handler applies `payload.new` directly for UPDATE/DELETE so status
// flips render in <50ms (vs ~1-5s of a full Server Action refetch). INSERT
// builds an optimistic row from the payload + the cached tables snapshot
// (postgres_changes carries no joins) AND fires a deduped fallback refresh
// in case the server-side filter applied differently than our local mapping.
export function useOrderSync({
  branchId,
  setTables,
  setOrders,
  getTables,
  getOrders,
  refreshOrders,
  refreshAll,
  onArchivedInvalidate,
  audioMode = "off",
  skipFirstSubscribedRefresh = false,
  refreshLimits,
  sessionId,
  onSessionClosed,
  onPrintJobUpdate,
  onPrintReconnect,
}: UseOrderSyncArgs): void {
  const refreshOrdersRef = useRef(refreshOrders);
  const refreshAllRef = useRef(refreshAll);
  const refreshLimitsRef = useRef(refreshLimits);
  const setTablesRef = useRef(setTables);
  const setOrdersRef = useRef(setOrders);
  const getTablesRef = useRef(getTables);
  const getOrdersRef = useRef(getOrders);
  const onArchivedInvalidateRef = useRef(onArchivedInvalidate);
  const audioModeRef = useRef(audioMode);
  const sessionIdRef = useRef(sessionId);
  const onSessionClosedRef = useRef(onSessionClosed);
  const onPrintJobUpdateRef = useRef(onPrintJobUpdate);
  const onPrintReconnectRef = useRef(onPrintReconnect);
  const lastSyncRef = useRef<number>(Date.now());
  const channelHealthRef = useRef<RealtimeChannelHealth>("connecting");
  const initialSubscribeSeenRef = useRef(false);

  useEffect(() => {
    refreshOrdersRef.current = refreshOrders;
    refreshAllRef.current = refreshAll;
    refreshLimitsRef.current = refreshLimits;
    setTablesRef.current = setTables;
    setOrdersRef.current = setOrders;
    getTablesRef.current = getTables;
    getOrdersRef.current = getOrders;
    onArchivedInvalidateRef.current = onArchivedInvalidate;
    audioModeRef.current = audioMode;
    sessionIdRef.current = sessionId;
    onSessionClosedRef.current = onSessionClosed;
    onPrintJobUpdateRef.current = onPrintJobUpdate;
    onPrintReconnectRef.current = onPrintReconnect;
  }, [
    refreshOrders,
    refreshAll,
    refreshLimits,
    setTables,
    setOrders,
    getTables,
    getOrders,
    onArchivedInvalidate,
    audioMode,
    sessionId,
    onSessionClosed,
    onPrintJobUpdate,
    onPrintReconnect,
  ]);

  useRealtimeChannel(
    (supabase) => {
      channelHealthRef.current = "connecting";
      const branchFilter = `branch_id=eq.${String(branchId)}`;
      return supabase
        .channel(`pos-branch-${String(branchId)}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
            filter: branchFilter,
          },
          (payload) => {
            lastSyncRef.current = Date.now();
            const eventType = payload.eventType;

            if (eventType === "DELETE") {
              const old = payload.old as { id?: unknown };
              const oldId =
                typeof old.id === "number" ? old.id : Number(old.id);
              if (!Number.isFinite(oldId)) {
                // Filter dropped the column (REPLICA IDENTITY safety net) —
                // fall back to a refetch so the list eventually converges.
                refreshOrdersRef.current();
                return;
              }
              setOrdersRef.current((prev) =>
                prev.filter((o) => o.id !== oldId),
              );
              return;
            }

            if (eventType === "UPDATE") {
              const updated = payload.new as Record<string, unknown> & {
                id?: unknown;
              };
              const newId =
                typeof updated.id === "number"
                  ? updated.id
                  : Number(updated.id);
              if (!Number.isFinite(newId)) {
                refreshOrdersRef.current();
                return;
              }

              // Provider holds ACTIVE orders only. A terminal-flip (paid /
              // completed / cancelled) means the row leaves the active list
              // and lands in the "Đã xử lý" sheet — remove from active state
              // and bump the archived invalidation token so an open sheet
              // can refetch its first page.
              const newStatus =
                typeof updated.status === "string" ? updated.status : null;
              const newPaymentStatus =
                typeof updated.payment_status === "string"
                  ? updated.payment_status
                  : null;
              const isTerminal =
                newPaymentStatus === "paid" ||
                newStatus === "completed" ||
                newStatus === "cancelled";
              const currentOrder = getOrdersRef
                .current()
                .find((order) => order.id === newId);

              notifyOrderTransition(
                currentOrder,
                updated,
                audioModeRef.current,
                branchId,
              );

              if (isTerminal) {
                setOrdersRef.current((prev) =>
                  prev.some((o) => o.id === newId)
                    ? prev.filter((o) => o.id !== newId)
                    : prev,
                );
                onArchivedInvalidateRef.current?.();
                return;
              }

              setOrdersRef.current((prev) => {
                const idx = prev.findIndex((o) => o.id === newId);
                if (idx < 0) {
                  // Order not in the current snapshot — could be a fresh row
                  // from another session that the local list hasn't fetched
                  // yet. Defer to a refetch rather than synthesizing one.
                  refreshOrdersRef.current();
                  return prev;
                }
                const current = prev[idx];
                if (!current) return prev;
                const next = prev.slice();
                next[idx] = applyOrderUpdate(
                  current,
                  updated,
                  getTablesRef.current(),
                );
                return next;
              });
              return;
            }

            if (eventType === "INSERT") {
              const optimistic = buildOptimisticOrder(
                payload.new as Record<string, unknown>,
                getTablesRef.current(),
              );
              if (optimistic === null) {
                refreshOrdersRef.current();
                return;
              }
              setOrdersRef.current((prev) => {
                if (prev.some((o) => o.id === optimistic.id)) return prev;
                return [optimistic, ...prev];
              });
              // Deduped refresh as fallback: covers fields fetchSessionOrders
              // applies that the optimistic mapping cannot (e.g. session filter
              // when the row is from another terminal). The deduper coalesces
              // concurrent triggers into ≤2 round-trips.
              refreshOrdersRef.current();
              return;
            }
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "tables",
            filter: branchFilter,
          },
          (payload) => {
            lastSyncRef.current = Date.now();
            const updated = payload.new as Partial<BranchTable> & {
              id: number;
            };
            setTablesRef.current((prev) => {
              const idx = prev.findIndex((t) => t.id === updated.id);
              if (idx < 0) return prev;
              const current = prev[idx];
              if (!current) return prev;
              const next = prev.slice();
              next[idx] = { ...current, ...updated };
              return next;
            });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `target_branch_id=eq.${String(branchId)}`,
          },
          (payload) => {
            const notification = payload.new as Record<string, unknown> | null;
            if (!notification || notification.kind !== "pos.kds_out_of_stock") {
              return;
            }
            notifyOutOfStock(notification, audioModeRef.current, branchId);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "branch_menu_item_daily_limits",
            filter: branchFilter,
          },
          (payload) => {
            if (
              !isCurrentDailyLimitRealtimeEvent(
                payload.eventType,
                payload,
                getVNDateString(),
              )
            ) {
              return;
            }
            refreshLimitsRef.current?.();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "pos_sessions",
            filter: branchFilter,
          },
          (payload) => {
            const currentSessionId = sessionIdRef.current;
            if (
              currentSessionId == null ||
              !isClosedPosSessionUpdate(payload.new, currentSessionId)
            ) {
              return;
            }
            onSessionClosedRef.current?.();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "print_jobs",
            filter: branchFilter,
          },
          (payload) => {
            onPrintJobUpdateRef.current?.({
              new: payload.new as PrintJobChangePayload["new"],
              old: (payload.old as PrintJobChangePayload["old"]) ?? null,
            });
          },
        )
        .subscribe((status) => {
          const health = realtimeHealthFromStatus(status);
          if (health !== null) channelHealthRef.current = health;
          if (status !== "SUBSCRIBED") return;
          // The FIRST SUBSCRIBED is the initial mount subscription. When
          // the caller has already seeded state (e.g. from RSC prefetch),
          // skip this one refresh — it would duplicate work. Every
          // SUBSCRIBED after that is a genuine reconnect and must refresh
          // to catch events missed during disconnect. Session close is
          // payload-only: reconnect must not refresh the RSC tree.
          if (!initialSubscribeSeenRef.current) {
            initialSubscribeSeenRef.current = true;
            if (skipFirstSubscribedRefresh) return;
          }
          refreshAllRef.current();
          refreshLimitsRef.current?.();
          onPrintReconnectRef.current?.();
        });
    },
    [branchId],
  );

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      if (
        !shouldRunRealtimeFallback(
          channelHealthRef.current,
          Date.now() - lastSyncRef.current,
        )
      ) {
        return;
      }
      lastSyncRef.current = Date.now();
      refreshAllRef.current();
    }, REALTIME_DEGRADED_POLL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  // Resume catch-up: when the tab becomes visible after being hidden,
  // fire one immediate refresh instead of waiting for the fallback tick.
  // Mobile Safari kills WebSockets after ~30s background, so realtime
  // events fired while hidden may not replay on reconnect — this is the
  // only safe path to catch a VietQR webhook that committed during the
  // hidden window. Mirrors use-notifications.ts:131-139 (POS-RESUME-MUST-REFETCH).
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshAllRef.current();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);
}
