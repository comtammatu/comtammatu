"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import dynamic from "next/dynamic";
import { formatVND } from "@comtammatu/shared/format";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import { makeRealtimeCoalescer } from "@/_utils/realtime-scheduler";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@comtammatu/ui/components/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { Item } from "@comtammatu/ui/components/item";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { Skeleton } from "@comtammatu/ui/components/skeleton";
import { notify } from "@comtammatu/ui/lib/notify";
import {
  ArrowRightLeft as IconArrowRightLeft,
  CircleDollarSign as IconCircleDollarSign,
  CirclePlus as IconCirclePlus,
  Copy as IconCopy,
  Ellipsis as IconDots,
  Flame as IconFlame,
  Merge as IconMerge,
  Printer as IconPrinter,
  Receipt as IconReceipt,
  Split as IconSplit,
  Trash2 as IconTrash,
  X as IconX,
} from "lucide-react";
import { AppBoneyardSkeleton } from "@/_components/boneyard-skeleton";
import {
  fetchOrderDetail,
  voidOrderItem,
  reduceOrderItemQuantity,
  cancelOrder,
  transferOrderTable,
  updateOrderStatus,
  markOrderItemServed,
  fetchOrderItemsForReorder,
  setOrderPriority,
  setOrderItemPriority,
  applyOrderDiscount,
  clearOrderDiscount,
  applyOrderItemDiscount,
  clearOrderItemDiscount,
  setOrderServiceCharge,
  splitOrder,
  mergeOrders,
} from "./actions";
import { printReceipt } from "./print-actions";
import { getPosLineItemDisplayName, type CartItem } from "./types";
import type { BranchTable } from "./page";
import { ACTIVE_POS_STATUSES } from "./order-history";
import { messages } from "@lib/messages";
import { OrderItemRow } from "./_components/order-detail/order-item-row";
import type { OrderItemRowData } from "./_components/order-detail/order-item-row";
import { OrderItemActionsSheet } from "./_components/order-detail/order-item-actions-sheet";
import { VoidItemDialog } from "./_components/order-detail/void-item-dialog";
import { ReduceQuantityDialog } from "./_components/order-detail/reduce-quantity-dialog";
import { CancelOrderDialog } from "./_components/order-detail/cancel-order-dialog";
import { TransferTableDialog } from "./_components/order-detail/transfer-table-dialog";
import { DiscountSheet } from "./_components/order-detail/discount-sheet";
import { ServiceChargeSheet } from "./_components/order-detail/service-charge-sheet";
// Dynamic imports — both sheets are tap-gated overflow actions ("Tách đơn"
// / "Ghép đơn"), not on the hot cashier path. Keeping them out of the
// initial chunk shrinks the order-detail bundle. ssr:false because both
// sheets rely on browser-only state (Sheet portal, swipe handlers) and
// have no SSR-rendered shell value.
const SplitOrderSheet = dynamic(
  () =>
    import("./_components/order-detail/split-order-sheet").then(
      (m) => m.SplitOrderSheet,
    ),
  { ssr: false },
);
const MergeOrdersSheet = dynamic(
  () =>
    import("./_components/order-detail/merge-orders-sheet").then(
      (m) => m.MergeOrdersSheet,
    ),
  { ssr: false },
);
import { OrderTotalsSummary } from "./_components/order-totals-summary";
import type { OrderData } from "./_components/bill/bill-receipt-types";
import type { SessionOrder } from "./order-history";

// Superset of bill's OrderData: same top-level fields, but order_items
// carry extra UI-only fields (status, menu_item_id) used by the detail
// sheet. Structurally assignable to OrderData → this type can be passed
// to BillReceipt.initialOrder without conversion.
export type OrderDetailData = Omit<OrderData, "order_items"> & {
  order_items: OrderItemRowData[];
};

function canAppendOrderStatus(status: string): boolean {
  return ACTIVE_POS_STATUSES.includes(status);
}

const ORDER_DETAIL_LOADING_TEXT = {
  append: "Th\u00eam m\u00f3n",
  aria: "\u0110ang t\u1ea3i danh s\u00e1ch m\u00f3n",
  payment: "Thanh to\u00e1n",
  served: "\u0110\u00e3 ph\u1ee5c v\u1ee5",
  sr: "\u0110ang t\u1ea3i \u0111\u01a1n h\u00e0ng",
} as const;

const ORDER_DETAIL_SKELETON_ITEMS: OrderItemRowData[] = [
  {
    id: 1,
    item_name: "Com tam suon",
    variant_name: "Tieu chuan",
    quantity: 2,
    unit_price: 65000,
    subtotal: 130000,
    discount_amount: 0,
    discount_type: null,
    discount_value: null,
    discount_note: null,
    status: "preparing",
    modifiers: [],
    sides: [],
    note: "It mo hanh",
    is_priority: false,
  },
  {
    id: 2,
    item_name: "Canh kho qua",
    variant_name: null,
    quantity: 1,
    unit_price: 25000,
    subtotal: 25000,
    discount_amount: 0,
    discount_type: null,
    discount_value: null,
    discount_note: null,
    status: "pending",
    modifiers: [],
    sides: [],
    note: null,
    is_priority: false,
  },
  {
    id: 3,
    item_name: "Tra da",
    variant_name: null,
    quantity: 2,
    unit_price: 5000,
    subtotal: 10000,
    discount_amount: 0,
    discount_type: null,
    discount_value: null,
    discount_note: null,
    status: "ready",
    modifiers: [],
    sides: [],
    note: null,
    is_priority: false,
  },
];

function OrderDetailLoadingFixture() {
  return (
    <>
      <ScrollArea className="min-h-0 w-full min-w-0 max-w-full flex-1 overflow-hidden">
        <ul
          className="flex w-full min-w-0 max-w-full flex-col gap-2 overflow-hidden px-3 py-2 sm:px-4"
          aria-label={ORDER_DETAIL_LOADING_TEXT.aria}
        >
          {ORDER_DETAIL_SKELETON_ITEMS.map((row) => (
            <OrderItemRow key={row.id} row={row} />
          ))}
        </ul>
      </ScrollArea>
      <div className="mt-auto flex shrink-0 flex-col gap-2 border-t px-3 py-3 sm:px-4">
        <Button type="button" size="touch" className="w-full">
          {ORDER_DETAIL_LOADING_TEXT.payment} · {formatVND(165000)}
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="flex-1"
          >
            {ORDER_DETAIL_LOADING_TEXT.append}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="touch"
            className="flex-1"
          >
            {ORDER_DETAIL_LOADING_TEXT.served}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-12 shrink-0"
            aria-label="Thao tác khác"
          >
            <IconDots />
          </Button>
        </div>
      </div>
    </>
  );
}

function OrderDetailSheetSkeletonFallback() {
  return (
    <>
      <ScrollArea className="min-h-0 w-full min-w-0 max-w-full flex-1 overflow-hidden">
        <ul
          className="flex w-full min-w-0 max-w-full flex-col gap-2 overflow-hidden px-3 py-2 sm:px-4"
          aria-label={ORDER_DETAIL_LOADING_TEXT.aria}
        >
          {Array.from({ length: 5 }).map((_, index) => (
            <Item key={index} asChild variant="outline" className="px-2.5 py-2">
              <li>
                <div className="flex items-start gap-3">
                  <Skeleton className="mt-1 size-4" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Skeleton className="h-5 w-4/5" />
                    <Skeleton className="h-4 w-3/5" />
                    <Skeleton className="h-4 w-2/5" />
                  </div>
                </div>
              </li>
            </Item>
          ))}
        </ul>
      </ScrollArea>
      <div className="mt-auto flex shrink-0 flex-col gap-2 border-t px-3 py-3 sm:px-4">
        <Skeleton className="h-12 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-12 flex-1" />
          <Skeleton className="size-12 shrink-0" />
        </div>
      </div>
      <span className="sr-only">{ORDER_DETAIL_LOADING_TEXT.sr}</span>
    </>
  );
}

/**
 * Branch ID is required for the discount/split/merge server actions —
 * they all gate on JWT.branch_id matching this URL param. Optional in the
 * type because some render sites do not thread it through; the
 * discount/split/merge buttons are gated on its presence.
 */
export interface OrderDetailSheetProps {
  branchId: number;
  orderId: number | null;
  orderNumber?: string | null;
  refreshToken?: number;
  /**
   * Parent-provided detail payload to seed the sheet on mount. When its
   * `id === orderId`, the sheet renders immediately from this data and
   * skips the `fetchOrderDetail` round-trip. `refreshToken` still forces
   * a fresh fetch when the caller needs it (e.g. after void/cancel).
   * Handed off by `fetchActiveOrderForTable` via the POS shell.
   */
  initialOrder?: OrderDetailData | null;
  /** canManageOrders hint matching `initialOrder` — mirrors fetchOrderDetail's result.canManageOrders. */
  initialCanManage?: boolean;
  /**
   * Lightweight summary from the orders LIST tap. Renders header (số đơn,
   * bàn / mang về) instantly while items fetch streams in. Distinct from
   * `initialOrder` (full detail with items). Money totals + status are
   * intentionally NOT taken from this — those fields can drift between
   * the list snapshot and the fresh fetch and would mislead the cashier.
   */
  initialSummary?: SessionOrder | null;
  onClose: () => void;
  /**
   * Hand off to the bill sheet. `seed` is the already-fetched order data —
   * pass it to BillReceipt so it skips its own round-trip.
   */
  onOpenBill: (orderId: number, seed: OrderData) => void;
  /** Start append flow: parent closes sheet and sets append target on menu */
  onStartAppend: (orderId: number, orderNumber: string) => void;
  /**
   * Start "Sửa món pending" flow — only fires for items where status='pending'.
   * Parent owns the menu lookup (menuItemById) + customizer state, so this
   * sheet just hands off the snapshot. Optional: not all hosts (mobile waiter
   * portal) need edit yet. */
  onStartEditSent?: (snapshot: OrderItemRowData) => void;
  onReorderToCart: (
    items: CartItem[],
    skippedCount: number,
    priceChangedCount: number,
  ) => void;
  tables: BranchTable[];
  /** Map<table_id, count of active orders> — drives the "N đơn" indicator
   * in the transfer-table dropdown so the cashier sees that the target
   * bàn already has guests before confirming a multi-order ghép. */
  orderCountByTable?: Map<number, number>;
  onOrderUpdated?: () => void | Promise<void>;
  /**
   * Start a SECOND order on this order's table. Replaces the picker's
   * "Tạo đơn mới" entry point for single-order tables, which now open
   * the detail sheet directly instead of the picker.
   */
  onCreateOrderOnTable?: (tableId: number) => void;
}

export function OrderDetailSheet({
  branchId,
  orderId,
  orderNumber,
  refreshToken,
  initialOrder,
  initialCanManage,
  initialSummary,
  onClose,
  onOpenBill,
  onStartAppend,
  onStartEditSent,
  onReorderToCart,
  tables,
  orderCountByTable,
  onOrderUpdated,
  onCreateOrderOnTable,
}: OrderDetailSheetProps) {
  const [data, setData] = useState<OrderDetailData | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two transitions on purpose:
  //   - `isMutating` gates the action buttons (Confirm in dialogs, "Phục vụ"
  //     / "Chuyển bàn" / "Thao tác" in the footer). It clears the moment the
  //     Server Action returns, so cashier can chain the next tap.
  //   - `isRefetching` covers the background fetchOrderDetail that follows
  //     a mutation (or initial mount). It keeps the skeleton visible for
  //     first-load only — once data is in place, refetch is silent and
  //     does NOT re-disable the action buttons.
  // Previously a single useTransition combined both, holding the buttons
  // disabled for ~400-600ms after the RPC completed while the refetch
  // streamed in. Cashier-perceived "1-2s wait to enable".
  const [isMutating, startMutation] = useTransition();
  const [isRefetching, startRefetch] = useTransition();
  const isPending = isMutating || isRefetching;
  const [voidItemId, setVoidItemId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [reduceItemId, setReduceItemId] = useState<number | null>(null);
  const [reduceNewQty, setReduceNewQty] = useState<number>(1);
  const [reduceReason, setReduceReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTableId, setTransferTableId] = useState<string>("");
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountItemId, setDiscountItemId] = useState<number | null>(null);
  const [showServiceCharge, setShowServiceCharge] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  // Tap-to-open per-item actions sheet. Reset on orderId change so a sheet
  // opened on order A doesn't leak into order B (item ids don't overlap
  // but visual state should be transient per-detail-session).
  const [actionsItemId, setActionsItemId] = useState<number | null>(null);
  const orderIdRef = useRef(orderId);
  useEffect(() => {
    orderIdRef.current = orderId;
  }, [orderId]);

  useEffect(() => {
    setActionsItemId(null);
    setDiscountItemId(null);
  }, [orderId]);

  const loadAsync = useCallback(async (): Promise<void> => {
    const targetOrderId = orderIdRef.current;
    if (targetOrderId === null) {
      setData(null);
      setError(null);
      return;
    }
    const result = await fetchOrderDetail(targetOrderId);
    if (orderIdRef.current !== targetOrderId) return;
    if (result.success && result.data) {
      setData(result.data.order as unknown as OrderDetailData);
      setCanManage(result.data.canManageOrders);
      setError(null);
    } else {
      setData(null);
      setError(result.error ?? messages.pos.order.loadFailed);
    }
  }, []);

  // Mount + refresh-token + post-mutation paths: wrap in the REFETCH
  // transition only. Action buttons stay enabled while the background
  // fetch streams in — `isRefetching` gates skeleton visibility (which
  // matters only on first load when `data` is still null) without
  // blocking the next cashier tap.
  const load = useCallback(() => {
    startRefetch(loadAsync);
  }, [loadAsync]);

  // Realtime burst guard: orders UPDATE + kds_tickets UPDATE + reconnect can
  // arrive in the same browser tick after one mutation. Coalesce the detail
  // refetch so the sheet stays fresh without turning every row event into RPC.
  const loadDeduped = useMemo(
    () =>
      makeRealtimeCoalescer(loadAsync, undefined, {
        metricName: "pos.order-detail.refresh",
      }),
    [loadAsync],
  );

  // Latest-value refs for the seed inputs. Reading them from refs (not
  // deps) keeps the mount effect from re-firing when the shell clears
  // the seed AFTER it has been applied — re-firing would trigger the
  // very `load()` we just avoided.
  const initialOrderRef = useRef(initialOrder);
  const initialCanManageRef = useRef(initialCanManage);
  useEffect(() => {
    initialOrderRef.current = initialOrder;
    initialCanManageRef.current = initialCanManage;
  }, [initialOrder, initialCanManage]);

  // Mount / orderId-change effect: seed from parent-provided payload
  // when it matches (no fetch), else call `load()`. `refreshToken` has
  // its own effect below that always re-fetches — so void/cancel/etc.
  // still see fresh data.
  useEffect(() => {
    if (orderId === null) {
      setData(null);
      setError(null);
      return;
    }
    const seed = initialOrderRef.current;
    if (seed != null && seed.id === orderId) {
      setData(seed);
      setCanManage(Boolean(initialCanManageRef.current));
      setError(null);
      return;
    }
    load();
  }, [load, orderId]);

  // Force-refresh effect: only fires when the parent BUMPS refreshToken
  // (e.g. after void/cancel/transfer). Using a ref to track the previous
  // value means the mount itself does not trigger a redundant fetch —
  // critical when the parent provides a seed via `initialOrder`, since
  // `0 == null` is false and the naive check would call `load()` and
  // flip `isPending=true`, briefly disabling "Chuyển bàn" / "Đã phục vụ" /
  // "Hủy đơn" even though the seed already painted the data.
  const lastRefreshTokenRef = useRef(refreshToken);
  useEffect(() => {
    if (orderId === null) return;
    if (lastRefreshTokenRef.current === refreshToken) return;
    lastRefreshTokenRef.current = refreshToken;
    load();
  }, [load, orderId, refreshToken]);

  // Cross-terminal realtime sync for the open order. The shell-level
  // `useOrderSync` only refreshes the orders LIST — the detail sheet
  // misses two classes of updates without its own subscription:
  //   1. Another terminal appends items (orders.subtotal/total UPDATE
  //      fires, but only the list listens) → totals + items go stale.
  //   2. KDS bumps a ticket (kds_tickets UPDATE → trigger flips
  //      order_items.status). order_items isn't in the publication, so
  //      neither the list nor the sheet sees per-item status changes
  //      until something else forces a refetch.
  // Orders channel + reconnect SUBSCRIBED → `loadDeduped` (in-flight + 1
  // trailing). KDS channel → raw `load` so per-item status flips reach
  // the cashier within one render frame.
  // Reconnect-resync (REALTIME-SUBSCRIBE-NEEDS-STATUS-CALLBACK): the
  // first SUBSCRIBED is the initial mount — data is already loaded by
  // the seed effect or the load() call above, so skip a redundant
  // refetch. Every later SUBSCRIBED is a reconnect after a dropped
  // socket; refetch then so events missed during the disconnect are
  // recovered.
  const initialDetailSubscribeSeenRef = useRef(false);
  useEffect(() => {
    initialDetailSubscribeSeenRef.current = false;
  }, [orderId]);

  // Stable refs for callbacks the realtime closures + visibility listener
  // need to read. Channel handlers run outside React's render scope; capturing
  // load/loadDeduped/onClose directly would re-create the channel on every
  // prop change.
  const loadDedupedRef = useRef(loadDeduped);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    loadDedupedRef.current = loadDeduped;
    onCloseRef.current = onClose;
  }, [loadDeduped, onClose]);

  useRealtimeChannel(
    (supabase) => {
      if (orderId === null) return null;
      return supabase
        .channel(`pos-order-detail-${String(orderId)}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "orders",
            filter: `id=eq.${String(orderId)}`,
          },
          (payload) => {
            // Cross-tablet auto-close: when terminal A cancels or merges
            // this order, terminal B's open detail sheet must close so
            // cashier B doesn't tap "Thanh toán" on a dead order. The
            // source-tablet flow calls onClose() explicitly after its own
            // RPC succeeds — this branch only matters when the close is
            // initiated remotely.
            if (payload.eventType === "UPDATE") {
              const updated = payload.new as Record<string, unknown> | null;
              if (updated) {
                const status =
                  typeof updated.status === "string" ? updated.status : null;
                const mergedInto =
                  updated.merged_into_order_id !== null &&
                  updated.merged_into_order_id !== undefined;
                if (status === "cancelled") {
                  notify.warning("Đơn đã bị huỷ — đóng chi tiết.");
                  onCloseRef.current();
                  return;
                }
                if (mergedInto) {
                  notify.warning(
                    "Đơn đã được gộp sang đơn khác — đóng chi tiết.",
                  );
                  onCloseRef.current();
                  return;
                }
              }
            }
            loadDedupedRef.current();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "kds_tickets",
            filter: `order_id=eq.${String(orderId)}`,
          },
          () => {
            loadDedupedRef.current();
          },
        )
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") return;
          if (!initialDetailSubscribeSeenRef.current) {
            initialDetailSubscribeSeenRef.current = true;
            return;
          }
          loadDedupedRef.current();
        });
    },
    [orderId],
  );

  // Visibility resume catch-up (POS-RESUME-MUST-REFETCH for the detail
  // surface). Mobile Safari kills WebSockets after ~30s background — events
  // fired during the hidden window may not replay on reconnect, so a single
  // dedup'd refetch on visibility=visible covers totals/discount drift the
  // cashier would otherwise see only after their next tap.
  useEffect(() => {
    if (orderId === null) return;
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        loadDedupedRef.current();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [orderId]);

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  const handleVoidConfirm = () => {
    if (voidItemId === null) return;
    const reason = voidReason.trim();
    // Mirror voidItemSchema min(5) so user gets immediate feedback
    // instead of a delayed server-side reject.
    if (reason.length < 5) {
      notify.error("Lý do hủy món tối thiểu 5 ký tự");
      return;
    }
    startMutation(async () => {
      const id = voidItemId;
      const r = await voidOrderItem(id, reason);
      if (r.success) {
        notify.success(
          r.data?.autoCancelledOrder
            ? messages.pos.item.voidedAutoCancelOrder
            : messages.pos.item.voided,
        );
        // Cancel-ticket print warning rides on result.meta.warning (set by
        // the afterSuccess hook in pos/_lib/messages.ts) per WS-1a. Pre-WS-1a
        // this lived on `r.data.printWarning`; the move keeps `data` to the
        // operator-facing result and moves non-fatal side-effect outcomes
        // to `meta`.
        const printWarning = r.meta?.warning;
        if (typeof printWarning === "string") {
          notify.warning(printWarning);
        }
        setVoidItemId(null);
        setVoidReason("");
        load();
      } else {
        notify.error(r.error ?? messages.pos.item.voidFailed);
      }
    });
  };

  const handleCancelOrder = () => {
    if (orderId === null) return;
    const reason = cancelReason.trim();
    // Mirror cancelOrderSchema min(5) so user gets immediate feedback
    // instead of a delayed server-side reject.
    if (reason.length < 5) {
      notify.error("Lý do hủy đơn tối thiểu 5 ký tự");
      return;
    }
    startMutation(async () => {
      const r = await cancelOrder(orderId, reason);
      if (r.success) {
        notify.success(messages.pos.order.voided);
        // Per-item cancel-ticket skip warning now lives on r.meta.warning
        // (set by cancelSkipReasonsToWarning inside the action handler) per
        // WS-1b. Pre-WS-1b this was r.data.printWarning.
        const cancelWarning = r.meta?.warning;
        if (typeof cancelWarning === "string") {
          notify.warning(cancelWarning);
        }
        setShowCancel(false);
        setCancelReason("");
        await onOrderUpdated?.();
        onClose();
      } else {
        notify.error(r.error ?? messages.pos.order.cancelFailed);
      }
    });
  };

  const handleTransfer = () => {
    if (orderId === null || transferTableId === "") return;
    const tid = Number.parseInt(transferTableId, 10);
    if (!Number.isFinite(tid)) return;
    if (tid === data?.table_id) return;
    // Mint per-click idempotency key — covers the network-flap retry case
    // BA flagged: server commits but client times out, cashier taps again
    // → server sees same key on retry and returns the prior result instead
    // of re-executing or rejecting. Aligns transfer with split/merge.
    const idempotencyKey = crypto.randomUUID();
    startMutation(async () => {
      const r = await transferOrderTable(orderId, tid, idempotencyKey);
      if (r.success) {
        if (!r.data?.idempotent) notify.success(messages.pos.order.transferred);
        setShowTransfer(false);
        setTransferTableId("");
        await onOrderUpdated?.();
        // No `load()` here — the detail sheet's own `pos-order-detail-${orderId}`
        // realtime channel patches `data` via `loadDeduped` on the orders UPDATE
        // emitted by the RPC commit. Saves ~400-600ms in `isPending` window.
      } else {
        notify.error(r.error ?? messages.pos.order.transferFailed);
      }
    });
  };

  const handleStatus = (next: "served") => {
    if (orderId === null) return;
    startMutation(async () => {
      const r = await updateOrderStatus(orderId, next);
      if (r.success) {
        notify.success(messages.pos.order.markedServed);
        await onOrderUpdated?.();
        load();
      } else {
        notify.error(r.error ?? messages.pos.order.statusUpdateFailed);
      }
    });
  };

  const handleMarkItemServed = (itemId: number) => {
    startMutation(async () => {
      const r = await markOrderItemServed(itemId);
      if (r.success) {
        notify.success("Đã phục vụ món");
        setActionsItemId(null);
        await onOrderUpdated?.();
        load();
      } else {
        notify.error(r.error ?? messages.pos.order.statusUpdateFailed);
      }
    });
  };

  const handleOrderPriorityToggle = () => {
    if (data === null) return;
    const next = data.is_priority !== true;
    startMutation(async () => {
      const r = await setOrderPriority(data.id, next);
      if (r.success) {
        notify.success(next ? "Đã ưu tiên đơn" : "Đã bỏ ưu tiên đơn");
        await onOrderUpdated?.();
        load();
      } else {
        notify.error(r.error ?? "Không thể cập nhật ưu tiên đơn.");
      }
    });
  };

  const handleItemPriorityRequest = (itemId: number, next: boolean) => {
    startMutation(async () => {
      const r = await setOrderItemPriority(itemId, next);
      if (r.success) {
        notify.success(next ? "Đã ưu tiên món" : "Đã bỏ ưu tiên món");
        setActionsItemId(null);
        load();
      } else {
        notify.error(r.error ?? "Không thể cập nhật ưu tiên món.");
      }
    });
  };

  // From the per-item actions sheet → close it and open the existing
  // VoidItemDialog (which collects the void reason). Sequencing the
  // two prevents stacked focus traps from fighting on mobile.
  const handleVoidRequest = (itemId: number) => {
    setActionsItemId(null);
    setVoidItemId(itemId);
  };

  // From the per-item actions sheet → close it and hand off to parent for
  // the edit-sent flow. Parent owns menu lookup + customizer state so it
  // can pre-populate variants/modifiers from the row snapshot. Server RPC
  // re-validates status='pending' regardless of UI gate.
  const handleEditRequest = (itemId: number) => {
    const target = data?.order_items.find((item) => item.id === itemId);
    if (!target || target.status !== "pending") return;
    if (target.menu_item_id == null) {
      notify.error("Thiếu dữ liệu món — tải lại đơn rồi thử lại.");
      return;
    }
    setActionsItemId(null);
    onStartEditSent?.(target);
  };

  const handleItemDiscountRequest = (itemId: number) => {
    const target = data?.order_items.find((item) => item.id === itemId);
    if (!target || target.status === "cancelled") return;
    setActionsItemId(null);
    setDiscountItemId(itemId);
  };

  // From the per-item actions sheet → open ReduceQuantityDialog seeded with
  // current qty - 1 (most common case: the customer drops one portion).
  // Reset reason so any prior cancel-flow text doesn't leak into reduce.
  const handleReduceRequest = (itemId: number) => {
    const target = data?.order_items.find((item) => item.id === itemId);
    if (!target || target.quantity < 2) return;
    setActionsItemId(null);
    setReduceItemId(itemId);
    setReduceNewQty(Math.max(target.quantity - 1, 1));
    setReduceReason("");
  };

  const handleReduceConfirm = () => {
    if (reduceItemId === null) return;
    const target = data?.order_items.find((item) => item.id === reduceItemId);
    if (!target) return;
    const reason = reduceReason.trim();
    if (reason.length < 5) {
      notify.error("Lý do giảm SL tối thiểu 5 ký tự");
      return;
    }
    if (reduceNewQty < 1 || reduceNewQty >= target.quantity) {
      notify.error("Số lượng mới phải nhỏ hơn số lượng hiện tại.");
      return;
    }
    startMutation(async () => {
      const id = reduceItemId;
      const r = await reduceOrderItemQuantity(id, reduceNewQty, reason);
      if (r.success) {
        notify.success(
          `Đã giảm SL: ${target.quantity} → ${r.data?.newQuantity ?? reduceNewQty}`,
        );
        // Partial-cancel print warning now lives on r.meta.warning (set by
        // enqueuePartialCancelTicketPrintHook in pos/_lib/messages.ts) per
        // WS-1b. Pre-WS-1b this was r.data.printWarning.
        const reduceWarning = r.meta?.warning;
        if (typeof reduceWarning === "string") {
          notify.warning(reduceWarning);
        }
        setReduceItemId(null);
        setReduceReason("");
        load();
      } else {
        notify.error(r.error ?? "Không thể giảm SL món.");
      }
    });
  };

  const handleReorder = () => {
    if (orderId === null) return;
    startMutation(async () => {
      const r = await fetchOrderItemsForReorder(orderId);
      if (r.success && r.data) {
        onReorderToCart(
          r.data.items,
          r.data.skippedCount,
          r.data.priceChangedCount,
        );
        onClose();
      } else {
        notify.error(r.error ?? messages.pos.order.reorderLoadFailed);
      }
    });
  };

  const handleReprintReceipt = () => {
    if (orderId === null) return;
    startMutation(async () => {
      const r = await printReceipt(orderId);
      if (r.success) {
        if (r.data?.agent_offline) {
          notify.warning("Máy in đang offline — hóa đơn sẽ in khi kết nối lại");
        } else {
          notify.success("Đã gửi hóa đơn tới máy in");
        }
      } else {
        notify.error(r.error ?? "Không thể in hóa đơn");
      }
    });
  };

  // Discount + service-charge handlers: rely on realtime alone for refresh.
  // - `load()` dropped: detail's own `pos-order-detail-${orderId}` channel
  //   fires `loadDeduped` on the orders UPDATE emitted by the RPC.
  // - `onOrderUpdated()` dropped: shell-level `applyOrderUpdate` now patches
  //   subtotal/discount_*/service_charge/total_amount in place from the same
  //   realtime payload (use-order-sync.ts), so the orders LIST refresh that
  //   refreshOperational triggers is redundant for these two flows.
  // Both rules collapse the cashier-perceived latency from ~1s to ~400ms.
  const handleApplyDiscount = (input: {
    type: "pct" | "vnd";
    value: number;
    note: string;
  }) => {
    if (orderId === null) return;
    startMutation(async () => {
      const r = await applyOrderDiscount(branchId, {
        orderId,
        type: input.type,
        value: input.value,
        note: input.note,
      });
      if (r.success) {
        notify.success("Đã áp chiết khấu");
        setShowDiscount(false);
      } else {
        notify.error(r.error ?? "Không thể áp chiết khấu.");
      }
    });
  };

  const handleClearDiscount = (reason: string) => {
    if (orderId === null) return;
    startMutation(async () => {
      const r = await clearOrderDiscount(branchId, orderId, reason);
      if (r.success) {
        notify.success("Đã bỏ chiết khấu");
        setShowDiscount(false);
      } else {
        notify.error(r.error ?? "Không thể bỏ chiết khấu.");
      }
    });
  };

  const handleApplyItemDiscount = (input: {
    type: "pct" | "vnd";
    value: number;
    note: string;
  }) => {
    if (discountItemId === null) return;
    const target = data?.order_items.find((item) => item.id === discountItemId);
    if (!target) return;
    startMutation(async () => {
      const r = await applyOrderItemDiscount(branchId, {
        orderItemId: target.id,
        type: input.type,
        value: input.value,
        note: input.note,
      });
      if (r.success) {
        notify.success("Đã áp chiết khấu món");
        setDiscountItemId(null);
        load();
      } else {
        notify.error(r.error ?? "Không thể áp chiết khấu món.");
      }
    });
  };

  const handleClearItemDiscount = (reason: string) => {
    if (discountItemId === null) return;
    const target = data?.order_items.find((item) => item.id === discountItemId);
    if (!target) return;
    startMutation(async () => {
      const r = await clearOrderItemDiscount(branchId, target.id, reason);
      if (r.success) {
        notify.success("Đã bỏ chiết khấu món");
        setDiscountItemId(null);
        load();
      } else {
        notify.error(r.error ?? "Không thể bỏ chiết khấu món.");
      }
    });
  };

  const handleSetServiceCharge = (input: { amount: number; note: string }) => {
    if (orderId === null) return;
    startMutation(async () => {
      const r = await setOrderServiceCharge(branchId, {
        orderId,
        amount: input.amount,
        note: input.note,
      });
      if (r.success) {
        notify.success("Đã cập nhật phụ phí");
        setShowServiceCharge(false);
      } else {
        notify.error(r.error ?? "Không thể cập nhật phụ phí.");
      }
    });
  };

  const handleClearServiceCharge = (reason: string) => {
    if (orderId === null) return;
    startMutation(async () => {
      const r = await setOrderServiceCharge(branchId, {
        orderId,
        amount: 0,
        note: reason,
      });
      if (r.success) {
        notify.success("Đã bỏ phụ phí");
        setShowServiceCharge(false);
      } else {
        notify.error(r.error ?? "Không thể bỏ phụ phí.");
      }
    });
  };

  const handleSplit = (
    partials: Array<{ itemId: number; quantity: number }>,
  ) => {
    if (orderId === null) return;
    // Mint client UUID so a network retry replays cleanly via
    // orders.idempotency_key on the new (split-out) order.
    const idempotencyKey = crypto.randomUUID();
    startMutation(async () => {
      const r = await splitOrder(branchId, {
        sourceOrderId: orderId,
        items: partials,
        idempotencyKey,
      });
      if (r.success && r.data) {
        notify.success(
          `Đã tách thành đơn mới #${r.data.new_order_number}. ` +
            `Vui lòng in lại tạm tính nếu cần.`,
        );
        setShowSplit(false);
        // Keep onOrderUpdated so the orders LIST picks up the brand-new row
        // (realtime INSERT in useOrderSync handles it too, but the parent
        // also wants tables status to refresh — split can flip the source's
        // table header indicator). `load()` dropped: detail's own realtime
        // channel patches the source order's mutated totals automatically.
        await onOrderUpdated?.();
      } else {
        notify.error(r.error ?? "Không thể tách đơn.");
      }
    });
  };

  const handleMerge = (targetOrderId: number) => {
    if (orderId === null) return;
    const idempotencyKey = crypto.randomUUID();
    startMutation(async () => {
      const r = await mergeOrders(branchId, {
        sourceOrderId: orderId,
        targetOrderId,
        idempotencyKey,
      });
      if (r.success) {
        notify.success(
          "Đã gộp đơn. Vui lòng in lại tạm tính của đơn nhận nếu cần.",
        );
        setShowMerge(false);
        await onOrderUpdated?.();
        // Source order is now cancelled — close the sheet so cashier focuses
        // on the target order instead of looking at a "Đã hủy" detail.
        onClose();
      } else {
        notify.error(r.error ?? "Không thể gộp đơn.");
      }
    });
  };

  // Multi-order-per-table alignment: an `occupied` target table is a valid
  // transfer destination — the order joins the existing order(s) on it.
  // `reserved` and `maintenance` stay excluded; the current table always
  // shows so the cashier keeps it as a fallback option.
  const availableTables = tables.filter(
    (t) =>
      t.status === "available" ||
      t.status === "occupied" ||
      t.id === data?.table_id,
  );

  const voidItem = data?.order_items.find((item) => item.id === voidItemId);
  const reduceItem = data?.order_items.find((item) => item.id === reduceItemId);
  const discountItem = data?.order_items.find(
    (item) => item.id === discountItemId,
  );
  const orderDiscountBase =
    data == null
      ? 0
      : Math.max(0, data.subtotal - Number(data.item_discount_amount ?? 0));
  const activeItemCount =
    data?.order_items.filter((item) => item.status !== "cancelled").length ?? 0;
  // Total active UNITS (quantity, not rows) on the order — drives the
  // split-bill gate so one row with qty=2 (e.g. "2 Cơm sườn") still qualifies.
  const activeUnitCount =
    data?.order_items
      .filter((item) => item.status !== "cancelled")
      .reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  const canShowCancel =
    canManage && data && !["completed", "cancelled"].includes(data.status);
  const canShowTransfer =
    data?.order_type === "dine_in" &&
    !["completed", "cancelled"].includes(data.status);
  const canShowReorder =
    data != null && ["completed", "cancelled"].includes(data.status);
  const canShowPaymentAction =
    data != null &&
    data.status !== "cancelled" &&
    data.payment_status !== "paid";
  const canShowBillInMenu =
    data != null &&
    data.status !== "cancelled" &&
    data.payment_status === "paid";
  const canMarkServed =
    data != null &&
    ["new", "confirmed", "preparing", "ready"].includes(data.status);
  const hasActiveKitchenItems =
    data?.order_items.some((item) =>
      ["pending", "preparing"].includes(item.status),
    ) ?? false;
  const canPrioritizeOrder =
    data != null &&
    hasActiveKitchenItems &&
    data.payment_status !== "paid" &&
    !["completed", "cancelled"].includes(data.status);
  // Financial adjustment / split / merge gating — all require an active
  // unpaid order with no pending QR. The server enforces the same conditions;
  // the UI guards just hide entries that would always reject.
  const canMutateUnpaidOrder =
    canShowPaymentAction && data?.payment_status !== "pending";
  const canShowDiscount = canMutateUnpaidOrder;
  const canShowServiceCharge = canMutateUnpaidOrder;
  const canShowSplit =
    canMutateUnpaidOrder &&
    data?.order_type === "dine_in" &&
    activeUnitCount >= 2;
  const tableSiblingCount =
    data?.table_id != null ? (orderCountByTable?.get(data.table_id) ?? 0) : 0;
  const canShowMerge =
    canMutateUnpaidOrder &&
    data?.order_type === "dine_in" &&
    data?.table_id != null &&
    tableSiblingCount >= 2;
  // "Chuyển bàn" lives in the ⋮ dropdown instead of its own full-width
  // button — keeps the footer short and the cashier's thumb near the main
  // CTAs ("Thanh toán" / "Thêm món" / "Phục vụ").
  const canShowMoreMenu =
    canShowBillInMenu ||
    canShowReorder ||
    canPrioritizeOrder ||
    canShowTransfer ||
    canShowCancel ||
    canShowDiscount ||
    canShowServiceCharge ||
    canShowSplit ||
    canShowMerge;
  // Use summary only when it matches the open order — stale summary from a
  // prior tap would otherwise leak into the header for a different order.
  const summaryForCurrentOrder =
    initialSummary != null && initialSummary.id === orderId
      ? initialSummary
      : null;
  const sheetTitle =
    data?.order_number ?? orderNumber ?? summaryForCurrentOrder?.order_number;
  const orderContextLabel = data
    ? data.order_type === "dine_in"
      ? `Bàn ${data.tables?.number ?? "—"}`
      : "Mang về"
    : summaryForCurrentOrder
      ? summaryForCurrentOrder.order_type === "dine_in"
        ? `Bàn ${summaryForCurrentOrder.tables?.number ?? "—"}`
        : "Mang về"
      : null;

  return (
    <>
      <Sheet open={orderId !== null} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="flex flex-col overflow-hidden data-[side=right]:w-full data-[side=right]:max-w-full data-[side=right]:sm:max-w-md"
        >
          <SheetHeader className="border-b border-border/60 px-3 py-2.5 text-left sm:px-4">
            <div className="flex items-center justify-between gap-3">
              <SheetTitle className="flex min-w-0 items-center gap-2 text-base">
                {orderContextLabel && <span>{orderContextLabel}</span>}
                {orderContextLabel && sheetTitle && (
                  <span className="text-muted-foreground">·</span>
                )}
                <span className="truncate">
                  {sheetTitle
                    ? `#${sheetTitle}`
                    : orderId !== null
                      ? "Đơn"
                      : ""}
                </span>
                {(data?.is_priority === true ||
                  summaryForCurrentOrder?.is_priority === true) && (
                  <Badge
                    variant="warning"
                    className="h-5 shrink-0 px-1.5 py-0 text-xs font-semibold"
                  >
                    Ưu tiên
                  </Badge>
                )}
              </SheetTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground"
                aria-label="Đóng chi tiết đơn"
                onClick={onClose}
              >
                <IconX />
              </Button>
            </div>
            <SheetDescription className="sr-only">
              Chi tiết đơn hàng, thêm món và cập nhật trạng thái phục vụ
            </SheetDescription>
          </SheetHeader>

          {isPending && !data && orderId !== null && (
            <AppBoneyardSkeleton
              name="pos-order-detail-sheet"
              loading
              className="flex min-h-0 flex-1 flex-col"
              fixture={<OrderDetailLoadingFixture />}
              fallback={<OrderDetailSheetSkeletonFallback />}
              snapshotConfig={{ excludeSelectors: ["svg"] }}
            >
              <ScrollArea className="min-h-0 w-full min-w-0 max-w-full flex-1 overflow-hidden">
                <ul
                  className="flex w-full min-w-0 max-w-full flex-col gap-2 overflow-hidden px-3 py-2 sm:px-4"
                  aria-label="Đang tải danh sách món"
                >
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Item
                      key={index}
                      asChild
                      variant="outline"
                      className="px-2.5 py-2"
                    >
                      <li>
                        <div className="flex items-start gap-3">
                          <Skeleton className="mt-1 size-4" />
                          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                            <Skeleton className="h-5 w-4/5" />
                            <Skeleton className="h-4 w-3/5" />
                            <Skeleton className="h-4 w-2/5" />
                          </div>
                        </div>
                      </li>
                    </Item>
                  ))}
                </ul>
              </ScrollArea>
              <div className="mt-auto flex shrink-0 flex-col gap-2 border-t px-3 py-3 sm:px-4">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-7 w-full" />
              </div>
              <span className="sr-only">Đang tải đơn hàng</span>
            </AppBoneyardSkeleton>
          )}

          {error && (
            <div className="flex flex-col gap-2">
              <p className="text-base text-destructive">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => load()}
              >
                {ACTIONS_VI.retry}
              </Button>
            </div>
          )}

          {data && !error && (
            <>
              {data.profiles?.full_name && (
                <p className="px-3 pt-2 text-xs text-muted-foreground sm:px-4">
                  Người order:{" "}
                  <span className="font-medium text-foreground">
                    {data.profiles.full_name}
                  </span>
                </p>
              )}
              <ScrollArea className="min-h-0 w-full min-w-0 max-w-full flex-1 overflow-hidden">
                <ul
                  className="flex w-full min-w-0 max-w-full flex-col gap-2 overflow-hidden px-3 py-2 sm:px-4"
                  aria-label="Danh sách món"
                >
                  {data.order_items.map((row) => (
                    <OrderItemRow
                      key={row.id}
                      row={row}
                      onTap={setActionsItemId}
                    />
                  ))}
                </ul>
                {data.note && (
                  <NoteCallout label="Ghi chú" className="mx-3 sm:mx-4">
                    {data.note}
                  </NoteCallout>
                )}
              </ScrollArea>

              <div className="mt-auto flex shrink-0 flex-col gap-2 border-t px-3 py-3 sm:px-4">
                {activeItemCount > 0 && (
                  <OrderTotalsSummary
                    subtotal={data.subtotal}
                    serviceCharge={data.service_charge}
                    discountAmount={data.discount_amount}
                    orderDiscountAmount={data.order_discount_amount}
                    itemDiscountAmount={data.item_discount_amount}
                    discountType={data.discount_type}
                    discountValue={data.discount_value}
                    discountNote={data.discount_note}
                    totalAmount={data.total_amount}
                    variant="compact"
                  />
                )}

                {canShowPaymentAction && (
                  <Button
                    type="button"
                    size="touch"
                    className="w-full"
                    onClick={() => {
                      onOpenBill(data.id, data);
                      onClose();
                    }}
                  >
                    Thanh toán · {formatVND(data.total_amount)}
                  </Button>
                )}

                {(canAppendOrderStatus(data.status) ||
                  canMarkServed ||
                  canShowMoreMenu) && (
                  <div className="flex gap-2">
                    {canAppendOrderStatus(data.status) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="touch"
                        className="flex-1"
                        onClick={() => {
                          onStartAppend(data.id, data.order_number);
                        }}
                      >
                        Thêm món
                      </Button>
                    )}
                    {canMarkServed && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="touch"
                        className="flex-1"
                        disabled={isMutating}
                        onClick={() => void handleStatus("served")}
                      >
                        Phục vụ
                      </Button>
                    )}
                    {canShowMoreMenu && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            size="touch"
                            aria-label="Thao tác khác"
                            className={
                              canAppendOrderStatus(data.status) || canMarkServed
                                ? "min-w-12 shrink-0 px-0"
                                : "flex-1"
                            }
                          >
                            <IconDots />
                            {!canAppendOrderStatus(data.status) &&
                              !canMarkServed && (
                                <span className="ml-1.5">Thao tác</span>
                              )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuGroup>
                            {canShowBillInMenu && (
                              <DropdownMenuItem
                                onClick={() => {
                                  onOpenBill(data.id, data);
                                  onClose();
                                }}
                              >
                                <IconReceipt />
                                Hóa đơn
                              </DropdownMenuItem>
                            )}
                            {canShowBillInMenu && (
                              <DropdownMenuItem
                                disabled={isMutating}
                                onClick={() => handleReprintReceipt()}
                              >
                                <IconPrinter />
                                In lại hóa đơn
                              </DropdownMenuItem>
                            )}
                            {canShowTransfer && (
                              <DropdownMenuItem
                                disabled={isMutating}
                                onClick={() => setShowTransfer(true)}
                              >
                                <IconArrowRightLeft />
                                Chuyển bàn
                              </DropdownMenuItem>
                            )}
                            {canPrioritizeOrder && (
                              <DropdownMenuItem
                                disabled={isMutating}
                                onClick={() => handleOrderPriorityToggle()}
                              >
                                <IconFlame />
                                {data.is_priority === true
                                  ? "Bỏ ưu tiên"
                                  : "Ưu tiên bếp"}
                              </DropdownMenuItem>
                            )}
                            {canShowReorder && (
                              <DropdownMenuItem
                                onClick={() => void handleReorder()}
                              >
                                <IconCopy />
                                Tạo đơn mới
                              </DropdownMenuItem>
                            )}
                            {onCreateOrderOnTable != null &&
                              data.order_type === "dine_in" &&
                              data.table_id != null &&
                              ACTIVE_POS_STATUSES.includes(data.status) &&
                              data.payment_status !== "paid" && (
                                <DropdownMenuItem
                                  disabled={isMutating}
                                  onClick={() => {
                                    const tableId = data.table_id;
                                    if (tableId == null) return;
                                    onClose();
                                    onCreateOrderOnTable(tableId);
                                  }}
                                >
                                  <IconCirclePlus />
                                  Thêm đơn cho bàn
                                </DropdownMenuItem>
                              )}
                          </DropdownMenuGroup>
                          {(canShowDiscount ||
                            canShowServiceCharge ||
                            canShowSplit ||
                            canShowMerge) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuGroup>
                                {canShowDiscount && (
                                  <DropdownMenuItem
                                    disabled={isMutating}
                                    onClick={() => setShowDiscount(true)}
                                  >
                                    <IconCircleDollarSign />
                                    {data.order_discount_amount > 0
                                      ? "Sửa chiết khấu"
                                      : "Chiết khấu"}
                                  </DropdownMenuItem>
                                )}
                                {canShowServiceCharge && (
                                  <DropdownMenuItem
                                    disabled={isMutating}
                                    onClick={() => setShowServiceCharge(true)}
                                  >
                                    <IconCirclePlus />
                                    {data.service_charge > 0
                                      ? "Sửa phụ phí"
                                      : "Phụ phí"}
                                  </DropdownMenuItem>
                                )}
                                {canShowSplit && (
                                  <DropdownMenuItem
                                    disabled={isMutating}
                                    onClick={() => setShowSplit(true)}
                                  >
                                    <IconSplit />
                                    Tách hóa đơn
                                  </DropdownMenuItem>
                                )}
                                {canShowMerge && (
                                  <DropdownMenuItem
                                    disabled={isMutating}
                                    onClick={() => setShowMerge(true)}
                                  >
                                    <IconMerge />
                                    Gộp hóa đơn
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuGroup>
                            </>
                          )}
                          {canShowCancel && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuGroup>
                                <DropdownMenuItem
                                  variant="destructive"
                                  disabled={isMutating}
                                  onClick={() => setShowCancel(true)}
                                >
                                  <IconTrash />
                                  Hủy đơn
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <OrderItemActionsSheet
        item={
          data?.order_items.find((item) => item.id === actionsItemId) ?? null
        }
        canManage={canManage}
        isPending={isMutating}
        onClose={() => setActionsItemId(null)}
        onMarkServed={handleMarkItemServed}
        onVoidRequest={handleVoidRequest}
        onReduceRequest={handleReduceRequest}
        onEditRequest={onStartEditSent ? handleEditRequest : undefined}
        onDiscountRequest={handleItemDiscountRequest}
        onPriorityRequest={handleItemPriorityRequest}
      />

      <VoidItemDialog
        open={voidItemId !== null}
        reason={voidReason}
        onReasonChange={setVoidReason}
        onCancel={() => setVoidItemId(null)}
        onConfirm={handleVoidConfirm}
        itemLabel={voidItem ? getPosLineItemDisplayName(voidItem) : null}
        isPending={isMutating}
      />

      <ReduceQuantityDialog
        open={reduceItemId !== null && reduceItem != null}
        currentQuantity={reduceItem?.quantity ?? 1}
        newQuantity={reduceNewQty}
        onNewQuantityChange={setReduceNewQty}
        reason={reduceReason}
        onReasonChange={setReduceReason}
        onCancel={() => setReduceItemId(null)}
        onConfirm={handleReduceConfirm}
        itemLabel={reduceItem ? getPosLineItemDisplayName(reduceItem) : null}
        isPending={isMutating}
      />

      <CancelOrderDialog
        open={showCancel}
        onOpenChange={setShowCancel}
        reason={cancelReason}
        onReasonChange={setCancelReason}
        onConfirm={handleCancelOrder}
        orderNumber={data?.order_number ?? orderNumber}
        orderType={data?.order_type ?? null}
        tableNumber={data?.tables?.number ?? null}
        itemCount={activeItemCount}
        isPending={isMutating}
      />

      <TransferTableDialog
        open={showTransfer}
        onOpenChange={setShowTransfer}
        tableId={transferTableId}
        onTableIdChange={setTransferTableId}
        currentTableId={data?.table_id ?? null}
        availableTables={availableTables}
        orderCountByTable={orderCountByTable}
        onConfirm={handleTransfer}
        orderNumber={data?.order_number ?? orderNumber}
        currentTableNumber={data?.tables?.number ?? null}
        isPending={isMutating}
      />

      {data && (
        <DiscountSheet
          open={showDiscount}
          onOpenChange={setShowDiscount}
          subtotal={orderDiscountBase}
          subtotalLabel={
            data.item_discount_amount > 0 ? "Sau giảm món" : undefined
          }
          serviceCharge={data.service_charge}
          current={{
            type: data.discount_type,
            value: data.discount_value,
            note: data.discount_note,
            amount: data.order_discount_amount,
          }}
          isPending={isMutating}
          onSubmit={handleApplyDiscount}
          onClear={handleClearDiscount}
        />
      )}

      {discountItem && (
        <DiscountSheet
          open={discountItemId !== null}
          onOpenChange={(open) => {
            if (!open) setDiscountItemId(null);
          }}
          title="Chiết khấu món"
          subtotalLabel="Giá món"
          totalLabel="Thành tiền mới"
          clearLabel="Bỏ chiết khấu món"
          subtotal={discountItem.subtotal}
          serviceCharge={0}
          current={{
            type: discountItem.discount_type,
            value: discountItem.discount_value,
            note: discountItem.discount_note,
            amount: discountItem.discount_amount,
          }}
          isPending={isMutating}
          onSubmit={handleApplyItemDiscount}
          onClear={handleClearItemDiscount}
        />
      )}

      {data && (
        <ServiceChargeSheet
          open={showServiceCharge}
          onOpenChange={setShowServiceCharge}
          subtotal={data.subtotal}
          taxAmount={data.tax_amount}
          discountAmount={data.discount_amount}
          currentAmount={data.service_charge}
          isPending={isMutating}
          onSubmit={handleSetServiceCharge}
          onClear={handleClearServiceCharge}
        />
      )}

      {data && (
        <SplitOrderSheet
          open={showSplit}
          onOpenChange={setShowSplit}
          orderNumber={data.order_number}
          tableNumber={data.tables?.number ?? null}
          items={data.order_items}
          isPending={isMutating}
          onSubmit={handleSplit}
        />
      )}

      {data && data.table_id != null && (
        <MergeOrdersSheet
          open={showMerge}
          onOpenChange={setShowMerge}
          branchId={branchId}
          sourceOrderId={data.id}
          sourceOrderNumber={data.order_number}
          sourceTableId={data.table_id}
          sourceTableNumber={data.tables?.number ?? null}
          sourceHasPctDiscount={
            data.order_discount_amount > 0 && data.discount_type === "pct"
          }
          isPending={isMutating}
          onSubmit={handleMerge}
        />
      )}
    </>
  );
}
