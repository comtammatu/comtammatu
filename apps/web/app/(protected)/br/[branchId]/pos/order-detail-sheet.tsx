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
import { formatVNElapsedCompact, formatVNTime } from "@comtammatu/shared/time";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
import { makeRealtimeCoalescer } from "@/_utils/realtime-scheduler";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import { Input } from "@comtammatu/ui/components/input";
import { Item } from "@comtammatu/ui/components/item";
import { NoteCallout } from "@comtammatu/ui/components/note-callout";
import { Skeleton } from "@comtammatu/ui/components/skeleton";
import { notify } from "@comtammatu/ui/lib/notify";
import { cn } from "@comtammatu/ui";
import {
  ArrowRightLeft as IconArrowRightLeft,
  Check as IconCheck,
  CircleDollarSign as IconCircleDollarSign,
  CirclePlus as IconCirclePlus,
  Copy as IconCopy,
  Ellipsis as IconEllipsis,
  Flame as IconFlame,
  Merge as IconMerge,
  NotebookPen as IconNotebookPen,
  Plus as IconPlus,
  Printer as IconPrinter,
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
  updatePosOrderNote,
  fetchOrderItemsForReorder,
  setOrderPriority,
  setOrderItemPriority,
  applyOrderDiscount,
  clearOrderDiscount,
  applyOrderItemDiscount,
  clearOrderItemDiscount,
  previewPromotionCode,
  applyPromotionCode,
  applyFreeSideSelection,
  clearPromotion,
  evaluateOrderPromotionOffers,
  setOrderServiceCharge,
  splitOrder,
  mergeOrders,
} from "./actions";
import { printReceipt } from "./print-actions";
import { voidPaidOrder } from "./void-paid-actions";
import { requestPosVoidAfterPaid } from "./void-request-actions";
import { getPosLineItemDisplayName, type CartItem } from "./types";
import type { BranchTable } from "./page";
import { ACTIVE_POS_STATUSES } from "./order-history";
import { messages } from "@lib/messages";
import { PROMOTIONS_VI } from "@comtammatu/shared/messages";
import { OrderItemRow } from "./_components/order-detail/order-item-row";
import type { OrderItemRowData } from "./_components/order-detail/order-item-row";
import { OrderItemActionsSheet } from "./_components/order-detail/order-item-actions-sheet";
import { VoidItemDialog } from "./_components/order-detail/void-item-dialog";
import { ReduceQuantityDialog } from "./_components/order-detail/reduce-quantity-dialog";
import { CancelOrderDialog } from "./_components/order-detail/cancel-order-dialog";
import { VoidPaidOrderDialog } from "./_components/order-detail/void-paid-order-dialog";
import { TransferTableDialog } from "./_components/order-detail/transfer-table-dialog";
import { EditOrderNoteDialog } from "./_components/order-detail/edit-order-note-dialog";
import { DiscountSheet, ITEM_DISCOUNT_MODES } from "./_components/order-detail/discount-sheet";
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
import type { RefundPayoutMethod } from "@lib/refund-payout";
import { confirmAndCancelPendingPayment } from "./_lib/confirm-cancel-pending-payment";
import {
  canOfferPosOrderAppend,
  isPosOrderAmountLocked,
} from "./_lib/table-order-visual-state";
import {
  StationSheet,
} from "@/components/surface";

// Superset of bill's OrderData: same top-level fields, but order_items
// carry extra UI-only fields (status, menu_item_id) used by the detail
// sheet. Structurally assignable to OrderData → this type can be passed
// to BillReceipt.initialOrder without conversion.
export type OrderDetailData = Omit<OrderData, "order_items"> & {
  order_items: OrderItemRowData[];
};

const ORDER_DETAIL_LOADING_TEXT = {
  append: "Th\u00eam m\u00f3n",
  aria: "\u0110ang t\u1ea3i danh s\u00e1ch m\u00f3n",
  payment: "Thanh to\u00e1n",
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
            variant="outline"
            size="icon-touch"
            className="shrink-0"
            aria-label={messages.pos.orderDetail.moreActionsAria}
          >
            <IconEllipsis />
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
            <Item
              key={index}
              variant="outline"
              className="px-3 py-2"
              render={<li />}
            >
              <div className="flex items-start gap-3">
                <Skeleton className="mt-1 size-4" />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <Skeleton className="h-5 w-4/5" />
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-4 w-2/5" />
                </div>
              </div>
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
   * sheet just hands off the snapshot. Optional: not all POS hosts
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
  /**
   * Tenant `pos_split_merge_enabled` flag. When false, the split/merge
   * entries hide so the cashier never taps an action the RPC would reject
   * with `split_merge_disabled`. Defaults to true when omitted.
   */
  canSplitMerge?: boolean;
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
  canSplitMerge = true,
  onOrderUpdated,
  onCreateOrderOnTable,
}: OrderDetailSheetProps) {
  const [data, setData] = useState<OrderDetailData | null>(null);
  const [freeSideOffer, setFreeSideOffer] = useState<{
    promotionId: number;
    name: string;
    kind: string;
    freeQty: number;
    needsSideSelection: boolean;
    amountHint: number;
    code: string | null;
    candidates: Array<{
      order_item_id: number;
      side_item_id: number;
      name: string;
      unit_price: number;
      max_units: number;
      parent_name: string;
    }>;
  } | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [canVoidPaid, setCanVoidPaid] = useState(false);
  const [canApplyDiscount, setCanApplyDiscount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Two transitions on purpose:
  //   - `isMutating` gates the action buttons (Confirm in dialogs, "Chuyển bàn"
  //     / "Thao tác" in the footer). It clears the moment the
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
  const [showVoidPaid, setShowVoidPaid] = useState(false);
  const [voidPaidReason, setVoidPaidReason] = useState("");
  const [refundPayoutMethod, setRefundPayoutMethod] =
    useState<RefundPayoutMethod | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTableId, setTransferTableId] = useState<string>("");
  const [showEditNote, setShowEditNote] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountItemId, setDiscountItemId] = useState<number | null>(null);
  const [showServiceCharge, setShowServiceCharge] = useState(false);
  const [showSplit, setShowSplit] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [inlinePromoCode, setInlinePromoCode] = useState("");
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
    setInlinePromoCode("");
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
      const order = result.data.order as unknown as OrderDetailData;
      const isTerminal =
        order.status === "completed" ||
        order.status === "cancelled" ||
        order.payment_status === "paid";
      if (isTerminal) {
        if (order.status === "cancelled") {
          notify.warning("Đơn đã bị huỷ — đóng chi tiết.");
        } else {
          notify.success("Đơn đã hoàn tất thanh toán — đóng chi tiết.");
        }
        setData(null);
        setFreeSideOffer(null);
        onCloseRef.current();
        return;
      }
      setData(order);
      setCanManage(result.data.canManageOrders);
      setCanVoidPaid(result.data.canVoidPaidOrder);
      setCanApplyDiscount(result.data.canApplyDiscount);
      setError(null);
      const offerResult = await evaluateOrderPromotionOffers(
        branchId,
        targetOrderId,
      );
      if (orderIdRef.current !== targetOrderId) return;
      if (offerResult.success && offerResult.data) {
        const first = offerResult.data.offers[0];
        setFreeSideOffer(
          first && first.free_qty > 0 && first.candidates.length > 0
            ? {
                promotionId: first.promotion_id,
                name: first.name,
                kind: "free_side",
                freeQty: first.free_qty,
                needsSideSelection: first.needs_side_selection,
                amountHint: first.amount_hint,
                code: first.code,
                candidates: first.candidates,
              }
            : null,
        );
      } else {
        setFreeSideOffer(null);
      }
    } else {
      setData(null);
      setFreeSideOffer(null);
      setError(result.error ?? messages.pos.order.loadFailed);
    }
  }, [branchId]);

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
      // canVoidPaidOrder not available in seed — fresh fetch will populate it
      setCanVoidPaid(false);
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
  // flip `isPending=true`, briefly disabling "Chuyển bàn" /
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
                const paymentStatus =
                  typeof updated.payment_status === "string"
                    ? updated.payment_status
                    : null;
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
                if (status === "completed" || paymentStatus === "paid") {
                  notify.success("Đơn đã hoàn tất thanh toán — đóng chi tiết.");
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
        // the afterSuccess hook in pos/_lib/messages.ts): `data` holds the
        // operator-facing result, non-fatal side-effect outcomes live on
        // `meta`.
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
        // Per-item cancel-ticket skip warning lives on r.meta.warning (set
        // by cancelSkipReasonsToWarning inside the action handler).
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

  const handleVoidPaid = () => {
    if (orderId === null || refundPayoutMethod === null) return;
    const reason = voidPaidReason.trim();
    if (reason.length < 20) {
      notify.error(messages.pos.order.voidPaidReasonMin);
      return;
    }
    startMutation(async () => {
      // Owner (pos:void_paid_order) voids directly; floor staff enqueue ADR 0023.
      const direct = await voidPaidOrder(orderId, reason, refundPayoutMethod);
      if (direct.success) {
        if (direct.data?.providerWarning) {
          notify.warning(direct.data.providerWarning);
        }
        notify.success(messages.pos.order.voidPaidSuccess);
        setShowVoidPaid(false);
        setVoidPaidReason("");
        setRefundPayoutMethod(null);
        await onOrderUpdated?.();
        onClose();
        return;
      }

      const requested = await requestPosVoidAfterPaid({
        orderId,
        reason,
        payoutMethod: refundPayoutMethod,
        branchId,
      });
      if (requested.success) {
        notify.success(messages.pos.order.voidPaidRequestSuccess);
        setShowVoidPaid(false);
        setVoidPaidReason("");
        setRefundPayoutMethod(null);
        await onOrderUpdated?.();
        onClose();
        return;
      }

      notify.error(
        requested.error ?? direct.error ?? messages.pos.order.voidPaidFailed,
      );
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
      const r = await transferOrderTable(
        branchId,
        orderId,
        tid,
        idempotencyKey,
      );
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

  const handleOrderPriorityToggle = () => {
    if (data === null) return;
    const next = data.is_priority !== true;
    startMutation(async () => {
      const r = await setOrderPriority(data.id, next);
      if (r.success) {
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
        setActionsItemId(null);
        load();
      } else {
        notify.error(r.error ?? "Không thể cập nhật ưu tiên món.");
      }
    });
  };

  const handleUpdateOrderNote = (newNote: string) => {
    if (orderId === null || data === null) return;
    startMutation(async () => {
      const r = await updatePosOrderNote(branchId, orderId, newNote);
      if (r.success) {
        setShowEditNote(false);
        setData((prev) =>
          prev
            ? {
                ...prev,
                note: r.data?.note ?? (newNote.trim() || null),
              }
            : null,
        );
        await onOrderUpdated?.();
        load();
      } else {
        notify.error(r.error ?? messages.pos.orderDetail.noteUpdateFailed);
      }
    });
  };

  const runAfterPendingPaymentUnlock = useCallback(
    (run: () => void) => {
      if (orderId == null || data == null) return;
      const locked = isPosOrderAmountLocked(data);
      void (async () => {
        const ok = await confirmAndCancelPendingPayment({
          branchId,
          orderId,
          locked,
        });
        if (!ok) return;
        if (locked) {
          setData((current) =>
            current
              ? { ...current, payment_method: null, payment_status: "unpaid" }
              : current,
          );
          void onOrderUpdated?.();
        }
        run();
      })();
    },
    [branchId, data, onOrderUpdated, orderId],
  );

  // From the per-item actions sheet → close it and open the existing
  // VoidItemDialog (which collects the void reason). Sequencing the
  // two prevents stacked focus traps from fighting on mobile.
  const handleVoidRequest = (itemId: number) => {
    runAfterPendingPaymentUnlock(() => {
      setActionsItemId(null);
      setVoidItemId(itemId);
    });
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
    runAfterPendingPaymentUnlock(() => {
      setActionsItemId(null);
      onStartEditSent?.(target);
    });
  };

  const handleItemDiscountRequest = (itemId: number) => {
    const target = data?.order_items.find((item) => item.id === itemId);
    if (!target || target.status === "cancelled") return;
    runAfterPendingPaymentUnlock(() => {
      setActionsItemId(null);
      setDiscountItemId(itemId);
    });
  };

  // From the per-item actions sheet → open ReduceQuantityDialog seeded with
  // current qty - 1 (most common case: the customer drops one portion).
  // Reset reason so any prior cancel-flow text doesn't leak into reduce.
  const handleReduceRequest = (itemId: number) => {
    const target = data?.order_items.find((item) => item.id === itemId);
    if (!target || target.quantity < 2) return;
    runAfterPendingPaymentUnlock(() => {
      setActionsItemId(null);
      setReduceItemId(itemId);
      setReduceNewQty(Math.max(target.quantity - 1, 1));
      setReduceReason("");
    });
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
        // Partial-cancel print warning lives on r.meta.warning (set by
        // enqueuePartialCancelTicketPrintHook in pos/_lib/messages.ts).
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
          notify.warning("Máy in đang mất kết nối — hóa đơn sẽ in khi kết nối lại");
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
        setShowDiscount(false);
      } else {
        notify.error(r.error ?? "Không thể bỏ chiết khấu.");
      }
    });
  };

  const handlePreviewPromoCode = async (code: string) => {
    if (orderId === null) {
      return { success: false as const, error: "Không tìm thấy đơn hàng." };
    }
    const r = await previewPromotionCode(branchId, { orderId, code });
    if (r.success && r.data) {
      return {
        success: true as const,
        amount: r.data.amount,
        name: r.data.name,
        kind: r.data.kind,
        needsSideSelection: r.data.needsSideSelection,
        promotionId: r.data.promotionId,
        freeQty: r.data.freeQty,
        candidates: r.data.candidates,
        amountHint: r.data.amountHint,
      };
    }
    return { success: false as const, error: r.error ?? "Không thể xem mức giảm." };
  };

  const handleApplyPromoCode = (
    code: string,
    sideSelections?: Array<{
      order_item_id: number;
      side_item_id: number;
      units: number;
    }>,
  ) => {
    if (orderId === null) return;
    startMutation(async () => {
      const r = await applyPromotionCode(branchId, {
        orderId,
        code,
        sideSelections,
      });
      if (r.success) {
        setShowDiscount(false);
        setInlinePromoCode("");
        load();
      } else {
        notify.error(r.error ?? PROMOTIONS_VI.loadFailed);
      }
    });
  };

  const handleInlinePromoSubmit = () => {
    const code = inlinePromoCode.trim().toUpperCase();
    if (orderId === null || code.length < 3) return;
    startMutation(async () => {
      const preview = await previewPromotionCode(branchId, { orderId, code });
      if (!preview.success || !preview.data) {
        notify.error(preview.error ?? PROMOTIONS_VI.loadFailed);
        return;
      }
      if (preview.data.needsSideSelection) {
        if (preview.data.promotionId == null) {
          notify.error(PROMOTIONS_VI.loadFailed);
          return;
        }
        setFreeSideOffer({
          promotionId: preview.data.promotionId,
          name: preview.data.name,
          kind: preview.data.kind,
          freeQty: preview.data.freeQty ?? 1,
          needsSideSelection: true,
          amountHint: preview.data.amountHint ?? preview.data.amount,
          code,
          candidates: preview.data.candidates,
        });
        setShowDiscount(true);
        return;
      }
      const r = await applyPromotionCode(branchId, { orderId, code });
      if (r.success) {
        setInlinePromoCode("");
        load();
      } else {
        notify.error(r.error ?? PROMOTIONS_VI.loadFailed);
      }
    });
  };

  const handleApplyFreeSide = (
    promotionId: number,
    selections: Array<{
      order_item_id: number;
      side_item_id: number;
      units: number;
    }>,
    code?: string | null,
  ) => {
    if (orderId === null) return;
    startMutation(async () => {
      const r = await applyFreeSideSelection(branchId, {
        orderId,
        promotionId,
        code,
        selections,
      });
      if (r.success) {
        setShowDiscount(false);
        setInlinePromoCode("");
        setFreeSideOffer(null);
        load();
      } else {
        notify.error(r.error ?? PROMOTIONS_VI.loadFailed);
      }
    });
  };

  const handleClearPromo = (reason: string) => {
    if (orderId === null) return;
    startMutation(async () => {
      const r = await clearPromotion(branchId, orderId, reason);
      if (r.success) {
        setShowDiscount(false);
        setInlinePromoCode("");
        load();
      } else {
        notify.error(r.error ?? PROMOTIONS_VI.loadFailed);
      }
    });
  };

  const handleApplyItemDiscount = (input: {
    type: "pct" | "vnd";
    value: number;
    note: string;
  }) => {
    if (discountItemId === null || input.type !== "vnd") return;
    const target = data?.order_items.find((item) => item.id === discountItemId);
    if (!target) return;
    startMutation(async () => {
      const r = await applyOrderItemDiscount(branchId, {
        orderItemId: target.id,
        type: "vnd",
        value: input.value,
        note: input.note,
      });
      if (r.success) {
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

  const canAppendItems =
    data != null && canOfferPosOrderAppend(data, ACTIVE_POS_STATUSES);
  const canShowCancel =
    canManage &&
    data &&
    !["completed", "cancelled"].includes(data.status);
  const canShowVoidPaid =
    canVoidPaid &&
    data != null &&
    data.payment_status === "paid" &&
    data.status !== "cancelled";
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
  const hasActiveKitchenItems =
    data?.order_items.some((item) =>
      ["pending", "preparing"].includes(item.status),
    ) ?? false;
  const canPrioritizeOrder =
    data != null &&
    hasActiveKitchenItems &&
    data.payment_status !== "paid" &&
    !["completed", "cancelled"].includes(data.status);
  // Amount-changing actions stay offered while VietQR is pending; the
  // confirm Dialog cancels that code before the original action continues.
  const canMutateUnpaidOrder = canShowPaymentAction;
  const hasPromotion = data?.promotion_id != null;
  const canShowDiscount = canMutateUnpaidOrder;
  const canShowManualDiscount = canMutateUnpaidOrder && canApplyDiscount;
  const canShowServiceCharge = canMutateUnpaidOrder;
  const canShowSplit =
    canSplitMerge &&
    canMutateUnpaidOrder &&
    data?.order_type === "dine_in" &&
    activeUnitCount >= 2;
  const tableSiblingCount =
    data?.table_id != null ? (orderCountByTable?.get(data.table_id) ?? 0) : 0;
  const canShowMerge =
    canSplitMerge &&
    canMutateUnpaidOrder &&
    data?.order_type === "dine_in" &&
    data?.table_id != null &&
    tableSiblingCount >= 2;
  const canEditNote =
    data != null && !["completed", "cancelled"].includes(data.status);
  // "Chuyển bàn" lives in the ⋮ dropdown instead of its own full-width
  // button — keeps the footer short and the cashier's thumb near the main
  // CTAs ("Thanh toán" / "Thêm món").
  const canShowMoreMenu =
    canShowBillInMenu ||
    canShowReorder ||
    canPrioritizeOrder ||
    canShowTransfer ||
    canEditNote ||
    canShowCancel ||
    canShowVoidPaid ||
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
      <StationSheet
        side="right"
        size="md"
        open={orderId !== null}
        onOpenChange={handleOpenChange}
        title={
          <span className="flex min-w-0 items-center gap-2 text-base font-semibold">
            {orderContextLabel && (
              <Badge variant="outline" className="shrink-0 text-xs font-semibold">
                {orderContextLabel}
              </Badge>
            )}
            <span className="truncate">
              {sheetTitle
                ? `#${sheetTitle}`
                : orderId !== null
                  ? messages.pos.orderDetail.genericOrderLabel
                  : ""}
            </span>
            {(data?.is_priority === true ||
              summaryForCurrentOrder?.is_priority === true) && (
              <Badge
                variant="warning"
                className="h-5 shrink-0 px-1.5 py-0 text-2xs font-semibold"
              >
                {messages.pos.orderDetail.priority}
              </Badge>
            )}
          </span>
        }
        description={messages.pos.orderDetail.srDescription}
        contentClassName="overflow-hidden"
        bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
      >

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
                  aria-label={messages.pos.orderDetail.loadingItemsAria}
                >
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Item
                      key={index}
                      variant="outline"
                      className="px-3 py-2"
                      render={<li />}
                    >
                      <div className="flex items-start gap-3">
                        <Skeleton className="mt-1 size-4" />
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <Skeleton className="h-5 w-4/5" />
                          <Skeleton className="h-4 w-3/5" />
                          <Skeleton className="h-4 w-2/5" />
                        </div>
                      </div>
                    </Item>
                  ))}
                </ul>
              </ScrollArea>
              <div className="mt-auto flex shrink-0 flex-col gap-2 border-t px-3 py-3 sm:px-4">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-7 w-full" />
              </div>
              <span className="sr-only">
                {messages.pos.orderDetail.loadingOrder}
              </span>
            </AppBoneyardSkeleton>
          )}

          {error && (
            <div className="flex flex-col gap-2 p-4">
              <p className="text-base text-destructive">{error}</p>
              <Button
                type="button"
                variant="outline"
                size="touch"
                onClick={() => load()}
              >
                {ACTIONS_VI.retry}
              </Button>
            </div>
          )}

          {data && !error && (
            <>
              <div className="flex items-center justify-between border-b border-border/40 px-3 py-2 text-xs text-muted-foreground sm:px-4">
                {data.profiles?.full_name ? (
                  <p>
                    {messages.pos.orderDetail.orderedByLabel}{" "}
                    <span className="font-medium text-foreground">
                      {data.profiles.full_name}
                    </span>
                  </p>
                ) : (
                  <span />
                )}
                {data.created_at ? (
                  <p className="tabular-nums">
                    {formatVNTime(data.created_at)}
                    {formatVNElapsedCompact(data.created_at) ? (
                      <span className="ml-1 font-normal opacity-80">
                        ({formatVNElapsedCompact(data.created_at)})
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <ScrollArea className="min-h-0 w-full min-w-0 max-w-full flex-1 overflow-hidden">
                <ul
                  className="flex w-full min-w-0 max-w-full flex-col gap-1.5 overflow-hidden px-3 py-2 sm:px-4"
                  aria-label={messages.pos.orderDetail.itemListAria}
                >
                  {data.order_items.map((row) => (
                    <OrderItemRow
                      key={row.id}
                      row={row}
                      onTap={setActionsItemId}
                    />
                  ))}
                </ul>
                {data.note ? (
                  <div className="mx-3 my-2 flex flex-col gap-1 sm:mx-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {messages.pos.orderDetail.noteLabel}
                      </span>
                      {canEditNote && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowEditNote(true)}
                          className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <IconNotebookPen className="size-3" />
                          <span>{messages.pos.orderDetail.editNote}</span>
                        </Button>
                      )}
                    </div>
                    <NoteCallout tone="muted">{data.note}</NoteCallout>
                  </div>
                ) : canEditNote ? (
                  <div className="mx-3 my-2 sm:mx-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="touch"
                      onClick={() => setShowEditNote(true)}
                      className="w-full justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <IconPlus className="size-3.5" />
                      <span>{messages.pos.orderDetail.addNote}</span>
                    </Button>
                  </div>
                ) : null}
              </ScrollArea>

              <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-border/60 bg-background px-3 py-3 sm:px-4">
                {canShowDiscount && activeItemCount > 0 ? (
                  <div className="flex items-center gap-2">
                    <Input
                      controlSize="touch"
                      value={
                        hasPromotion
                          ? (data.discount_note || PROMOTIONS_VI.posPromoChip)
                          : inlinePromoCode
                      }
                      onChange={(e) => setInlinePromoCode(e.target.value)}
                      onKeyDown={(e) => {
                        if (
                          e.key === "Enter" &&
                          !hasPromotion &&
                          inlinePromoCode.trim().length >= 3 &&
                          !isMutating
                        ) {
                          e.preventDefault();
                          handleInlinePromoSubmit();
                        }
                      }}
                      disabled={isMutating}
                      readOnly={hasPromotion}
                      placeholder={PROMOTIONS_VI.inlinePromoPlaceholder}
                      className={cn(
                        "font-mono",
                        hasPromotion && "bg-muted text-foreground select-none",
                      )}
                      autoComplete="off"
                      autoCorrect="off"
                      spellCheck={false}
                      inputMode="text"
                    />
                    {hasPromotion ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-touch"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          handleClearPromo(PROMOTIONS_VI.inlinePromoClearReason)
                        }
                        disabled={isMutating}
                        aria-label={PROMOTIONS_VI.posClearPromo}
                      >
                        <IconX className="size-5" />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-touch"
                        onClick={() => {
                          if (inlinePromoCode.trim().length >= 3) {
                            handleInlinePromoSubmit();
                          }
                        }}
                        disabled={
                          isMutating || inlinePromoCode.trim().length < 3
                        }
                        aria-label={PROMOTIONS_VI.posApplyCode}
                      >
                        <IconCheck className="size-5" />
                      </Button>
                    )}
                  </div>
                ) : null}
                {!hasPromotion && freeSideOffer ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="touch"
                    className="w-full justify-between"
                    onClick={() => {
                      setShowDiscount(true);
                    }}
                  >
                    <span>{PROMOTIONS_VI.posOfferChip}</span>
                    <span className="truncate text-muted-foreground">
                      {freeSideOffer.name}
                    </span>
                  </Button>
                ) : null}
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
                    size="touch-lg"
                    className="w-full text-base font-semibold"
                    onClick={() => {
                      onOpenBill(data.id, data);
                      onClose();
                    }}
                  >
                    {messages.pos.orderDetail.paymentAmount(
                      formatVND(data.total_amount),
                    )}
                  </Button>
                )}

                {(canAppendItems || canShowMoreMenu) && (
                  <div className="flex gap-2">
                    {canAppendItems && (
                      <Button
                        type="button"
                        variant="outline"
                        size="touch"
                        className="flex-1 font-semibold"
                        onClick={() => {
                          runAfterPendingPaymentUnlock(() => {
                            onStartAppend(data.id, data.order_number);
                          });
                        }}
                      >
                        {messages.pos.orderDetail.appendItems}
                      </Button>
                    )}
                    {canShowMoreMenu && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              type="button"
                              variant="outline"
                              size={canAppendItems ? "icon-touch" : "touch"}
                              aria-label={
                                messages.pos.orderDetail.moreActionsAria
                              }
                              className={canAppendItems ? "shrink-0" : "flex-1"}
                            >
                              <IconEllipsis />
                              {!canAppendItems && (
                                <span className="ml-1.5">
                                  {messages.pos.orderDetail.moreActions}
                                </span>
                              )}
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuGroup>
                            {canShowBillInMenu && (
                              <DropdownMenuItem
                                className="min-h-12 text-sm"
                                disabled={isMutating}
                                onClick={() => handleReprintReceipt()}
                              >
                                <IconPrinter />
                                {messages.pos.orderDetail.reprintReceipt}
                              </DropdownMenuItem>
                            )}
                            {canShowTransfer && (
                              <DropdownMenuItem
                                className="min-h-12 text-sm"
                                disabled={isMutating}
                                onClick={() => setShowTransfer(true)}
                              >
                                <IconArrowRightLeft />
                                {messages.pos.orderDetail.transferTable}
                              </DropdownMenuItem>
                            )}
                            {canPrioritizeOrder && (
                              <DropdownMenuItem
                                className="min-h-12 text-sm"
                                disabled={isMutating}
                                onClick={() => handleOrderPriorityToggle()}
                              >
                                <IconFlame />
                                {data.is_priority === true
                                  ? messages.pos.orderDetail.removePriority
                                  : messages.pos.orderDetail.kitchenPriority}
                              </DropdownMenuItem>
                            )}
                            {canShowReorder && (
                              <DropdownMenuItem
                                className="min-h-12 text-sm"
                                onClick={() => void handleReorder()}
                              >
                                <IconCopy />
                                {messages.pos.orderDetail.reorder}
                              </DropdownMenuItem>
                            )}
                            {onCreateOrderOnTable != null &&
                              data.order_type === "dine_in" &&
                              data.table_id != null &&
                              ACTIVE_POS_STATUSES.includes(data.status) &&
                              data.payment_status !== "paid" && (
                                <DropdownMenuItem
                                  className="min-h-12 text-sm"
                                  disabled={isMutating}
                                  onClick={() => {
                                    const tableId = data.table_id;
                                    if (tableId == null) return;
                                    onClose();
                                    onCreateOrderOnTable(tableId);
                                  }}
                                >
                                  <IconCirclePlus />
                                  {messages.pos.orderDetail.createOrderOnTable}
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
                                    className="min-h-12 text-sm"
                                    disabled={isMutating}
                                    onClick={() =>
                                      runAfterPendingPaymentUnlock(() => {
                                        setShowDiscount(true);
                                      })
                                    }
                                  >
                                    <IconCircleDollarSign />
                                    {data.order_discount_amount > 0
                                      ? messages.pos.orderDetail.editDiscount
                                      : messages.pos.orderDetail.discount}
                                  </DropdownMenuItem>
                                )}
                                {canShowServiceCharge && (
                                  <DropdownMenuItem
                                    className="min-h-12 text-sm"
                                    disabled={isMutating}
                                    onClick={() =>
                                      runAfterPendingPaymentUnlock(() =>
                                        setShowServiceCharge(true),
                                      )
                                    }
                                  >
                                    <IconCirclePlus />
                                    {data.service_charge > 0
                                      ? messages.pos.orderDetail
                                          .editServiceCharge
                                      : messages.pos.orderDetail.serviceCharge}
                                  </DropdownMenuItem>
                                )}
                                {canShowSplit && (
                                  <DropdownMenuItem
                                    className="min-h-12 text-sm"
                                    disabled={isMutating}
                                    onClick={() =>
                                      runAfterPendingPaymentUnlock(() =>
                                        setShowSplit(true),
                                      )
                                    }
                                  >
                                    <IconSplit />
                                    {messages.pos.orderDetail.splitBill}
                                  </DropdownMenuItem>
                                )}
                                {canShowMerge && (
                                  <DropdownMenuItem
                                    className="min-h-12 text-sm"
                                    disabled={isMutating}
                                    onClick={() =>
                                      runAfterPendingPaymentUnlock(() =>
                                        setShowMerge(true),
                                      )
                                    }
                                  >
                                    <IconMerge />
                                    {messages.pos.orderDetail.mergeBill}
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuGroup>
                            </>
                          )}
                          {(canShowCancel || canShowVoidPaid) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuGroup>
                                {canShowCancel && (
                                  <DropdownMenuItem
                                    variant="destructive"
                                    className="min-h-12 text-sm"
                                    disabled={isMutating}
                                    onClick={() =>
                                      runAfterPendingPaymentUnlock(() =>
                                        setShowCancel(true),
                                      )
                                    }
                                  >
                                    <IconTrash />
                                    {messages.pos.orderDetail.cancelOrder}
                                  </DropdownMenuItem>
                                )}
                                {canShowVoidPaid && (
                                  <DropdownMenuItem
                                    variant="destructive"
                                    className="min-h-12 text-sm"
                                    disabled={isMutating}
                                    onClick={() => {
                                      setRefundPayoutMethod(null);
                                      setShowVoidPaid(true);
                                    }}
                                  >
                                    <IconTrash />
                                    {messages.pos.order.voidPaidAction}
                                  </DropdownMenuItem>
                                )}
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
      </StationSheet>

      <OrderItemActionsSheet
        item={
          data?.order_items.find((item) => item.id === actionsItemId) ?? null
        }
        canManage={canManage && canMutateUnpaidOrder}
        canApplyDiscount={canShowManualDiscount}
        isPending={isMutating}
        onClose={() => setActionsItemId(null)}
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

      <VoidPaidOrderDialog
        open={showVoidPaid}
        onOpenChange={setShowVoidPaid}
        reason={voidPaidReason}
        onReasonChange={setVoidPaidReason}
        payoutMethod={refundPayoutMethod}
        onPayoutMethodChange={setRefundPayoutMethod}
        onConfirm={handleVoidPaid}
        orderNumber={data?.order_number ?? orderNumber}
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

      <EditOrderNoteDialog
        open={showEditNote}
        onOpenChange={setShowEditNote}
        currentNote={data?.note ?? null}
        orderNumber={data?.order_number ?? orderNumber}
        isPending={isMutating}
        onSubmit={handleUpdateOrderNote}
      />

      {data && (
        <DiscountSheet
          open={showDiscount}
          onOpenChange={(open) => {
            setShowDiscount(open);
          }}
          subtotal={orderDiscountBase}
          subtotalLabel={
            data.item_discount_amount > 0
              ? messages.pos.orderDetail.postItemDiscountSubtotal
              : undefined
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
          promo={{
            enabled: true,
            canManual: canShowManualDiscount,
            hasPromotion: Boolean(hasPromotion),
            initialOffer: freeSideOffer
                ? {
                    promotionId: freeSideOffer.promotionId,
                    name: freeSideOffer.name,
                    kind: freeSideOffer.kind,
                    freeQty: freeSideOffer.freeQty,
                    needsSideSelection: freeSideOffer.needsSideSelection,
                    amountHint: freeSideOffer.amountHint,
                    code: freeSideOffer.code,
                    candidates: freeSideOffer.candidates,
                  }
                : null,
            onPreview: handlePreviewPromoCode,
            onApplyCode: handleApplyPromoCode,
            onApplyFreeSide: handleApplyFreeSide,
            onClearPromo: handleClearPromo,
          }}
        />
      )}

      {discountItem && (
        <DiscountSheet
          open={discountItemId !== null}
          onOpenChange={(open) => {
            if (!open) setDiscountItemId(null);
          }}
          title={messages.pos.orderDetail.itemDiscountTitle}
          subtotalLabel={messages.pos.orderDetail.itemDiscountSubtotal}
          totalLabel={messages.pos.orderDetail.itemDiscountTotal}
          clearLabel={messages.pos.orderDetail.clearItemDiscount}
          modes={ITEM_DISCOUNT_MODES}
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
