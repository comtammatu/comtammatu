"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { formatVND } from "@comtammatu/shared/format";
import { useRealtimeChannel } from "@/_hooks/use-realtime-channel";
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
import { Skeleton } from "@comtammatu/ui/components/skeleton";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { notify } from "@comtammatu/ui/lib/notify";
import {
  Ellipsis as IconDots,
  Receipt as IconReceipt,
  X as IconX,
} from "lucide-react";
import { AppBoneyardSkeleton } from "../../../_components/boneyard-skeleton";
import {
  fetchOrderDetail,
  voidOrderItem,
  cancelOrder,
  transferOrderTable,
  updateOrderStatus,
  fetchOrderItemsForReorder,
} from "./actions";
import { getPosLineItemDisplayName, type CartItem } from "./types";
import type { BranchTable } from "./page";
import { messages } from "@lib/messages";
import { printProvisionalBill } from "./print-actions";
import { OrderItemRow } from "./_components/order-detail/order-item-row";
import type { OrderItemRowData } from "./_components/order-detail/order-item-row";
import { VoidItemDialog } from "./_components/order-detail/void-item-dialog";
import { CancelOrderDialog } from "./_components/order-detail/cancel-order-dialog";
import { TransferTableDialog } from "./_components/order-detail/transfer-table-dialog";
import type { OrderData } from "./_components/bill/bill-receipt-types";

// Superset of bill's OrderData: same top-level fields, but order_items
// carry extra UI-only fields (status, menu_item_id) used by the detail
// sheet. Structurally assignable to OrderData → this type can be passed
// to BillReceipt.initialOrder without conversion.
export type OrderDetailData = Omit<OrderData, "order_items"> & {
  order_items: OrderItemRowData[];
};

function canAppendOrderStatus(status: string): boolean {
  return ["new", "confirmed", "preparing", "ready", "served"].includes(status);
}

const ORDER_DETAIL_LOADING_TEXT = {
  append: "Th\u00eam m\u00f3n",
  aria: "\u0110ang t\u1ea3i danh s\u00e1ch m\u00f3n",
  payment: "Thanh to\u00e1n",
  print: "In phi\u1ebfu t\u1ea1m t\u00ednh",
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
    status: "preparing",
    modifiers: [],
    sides: [],
    note: "It mo hanh",
  },
  {
    id: 2,
    item_name: "Canh kho qua",
    variant_name: null,
    quantity: 1,
    unit_price: 25000,
    subtotal: 25000,
    status: "pending",
    modifiers: [],
    sides: [],
    note: null,
  },
  {
    id: 3,
    item_name: "Tra da",
    variant_name: null,
    quantity: 2,
    unit_price: 5000,
    subtotal: 10000,
    status: "ready",
    modifiers: [],
    sides: [],
    note: null,
  },
];

function OrderDetailLoadingFixture() {
  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <ul
          className="flex flex-col gap-2 px-3 py-2 sm:px-4"
          aria-label={ORDER_DETAIL_LOADING_TEXT.aria}
        >
          {ORDER_DETAIL_SKELETON_ITEMS.map((row) => (
            <OrderItemRow
              key={row.id}
              row={row}
              canManage={false}
              onVoid={() => undefined}
            />
          ))}
        </ul>
      </ScrollArea>
      <div className="mt-auto flex shrink-0 flex-col gap-2 border-t px-3 py-3 sm:px-4">
        <Button type="button" variant="outline" size="lg" className="w-full">
          <IconReceipt data-icon="inline-start" />
          {ORDER_DETAIL_LOADING_TEXT.print}
        </Button>
        <Button type="button" size="lg" className="w-full">
          {ORDER_DETAIL_LOADING_TEXT.payment} - {formatVND(165000)}
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1">
            {ORDER_DETAIL_LOADING_TEXT.append}
          </Button>
          <Button type="button" variant="secondary" className="flex-1">
            {ORDER_DETAIL_LOADING_TEXT.served}
          </Button>
        </div>
      </div>
    </>
  );
}

function OrderDetailSheetSkeletonFallback() {
  return (
    <>
      <ScrollArea className="min-h-0 flex-1">
        <ul
          className="flex flex-col gap-2 px-3 py-2 sm:px-4"
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
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-7 w-full" />
      </div>
      <span className="sr-only">{ORDER_DETAIL_LOADING_TEXT.sr}</span>
    </>
  );
}

export interface OrderDetailSheetProps {
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
  onClose: () => void;
  /**
   * Hand off to the bill sheet. `seed` is the already-fetched order data —
   * pass it to BillReceipt so it skips its own round-trip.
   */
  onOpenBill: (orderId: number, seed: OrderData) => void;
  /** Start append flow: parent closes sheet and sets append target on menu */
  onStartAppend: (orderId: number, orderNumber: string) => void;
  onReorderToCart: (items: CartItem[], skippedCount: number) => void;
  tables: BranchTable[];
  /** Map<table_id, count of active orders> — drives the "N đơn" indicator
   * in the transfer-table dropdown so the cashier sees that the target
   * bàn already has guests before confirming a multi-order ghép. */
  orderCountByTable?: Map<number, number>;
  onOrderUpdated?: () => void | Promise<void>;
}

export function OrderDetailSheet({
  orderId,
  orderNumber,
  refreshToken,
  initialOrder,
  initialCanManage,
  onClose,
  onOpenBill,
  onStartAppend,
  onReorderToCart,
  tables,
  orderCountByTable,
  onOrderUpdated,
}: OrderDetailSheetProps) {
  const [data, setData] = useState<OrderDetailData | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [voidItemId, setVoidItemId] = useState<number | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferTableId, setTransferTableId] = useState<string>("");
  const [printPending, startPrintTransition] = useTransition();

  const load = useCallback(() => {
    if (orderId === null) {
      setData(null);
      setError(null);
      return;
    }
    startTransition(async () => {
      const result = await fetchOrderDetail(orderId);
      if (result.success && result.data) {
        setData(result.data.order as unknown as OrderDetailData);
        setCanManage(result.data.canManageOrders);
        setError(null);
      } else {
        setData(null);
        setError(result.error ?? messages.pos.order.loadFailed);
      }
    });
  }, [orderId]);

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
  // flip `isPending=true`, briefly disabling Chuyển bàn / Đã phục vụ /
  // Hủy đơn even though the seed already painted the data.
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
  // Subscribing to orders (id=eq) + kds_tickets (order_id=eq) for the
  // open order_id fixes both. `load()` already coalesces via React's
  // useTransition; an extra fetch from a burst is acceptable.
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
          () => {
            load();
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
            load();
          },
        )
        .subscribe();
    },
    [load, orderId],
  );

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
    startTransition(async () => {
      const id = voidItemId;
      const r = await voidOrderItem(id, reason);
      if (r.success) {
        notify.success(
          r.data?.autoCancelledOrder
            ? messages.pos.item.voidedAutoCancelOrder
            : messages.pos.item.voided,
        );
        if (r.data?.printWarning) {
          notify.warning(r.data.printWarning);
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
    startTransition(async () => {
      const r = await cancelOrder(orderId, reason);
      if (r.success) {
        notify.success(messages.pos.order.voided);
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
    startTransition(async () => {
      const r = await transferOrderTable(orderId, tid);
      if (r.success) {
        notify.success(messages.pos.order.transferred);
        setShowTransfer(false);
        setTransferTableId("");
        await onOrderUpdated?.();
        load();
      } else {
        notify.error(r.error ?? messages.pos.order.transferFailed);
      }
    });
  };

  const handleStatus = (next: "served") => {
    if (orderId === null) return;
    startTransition(async () => {
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

  const handleReorder = () => {
    if (orderId === null) return;
    startTransition(async () => {
      const r = await fetchOrderItemsForReorder(orderId);
      if (r.success && r.data) {
        onReorderToCart(r.data.items, r.data.skippedCount);
        onClose();
      } else {
        notify.error(r.error ?? messages.pos.order.reorderLoadFailed);
      }
    });
  };

  const handlePrintProvisional = () => {
    if (orderId === null) return;
    startPrintTransition(async () => {
      const r = await printProvisionalBill(orderId);
      if (r.success) {
        notify.success("Đã gửi phiếu tạm tính tới máy in");
      } else {
        notify.error(r.error ?? "Không thể in phiếu tạm tính");
      }
    });
  };

  // Multi-order-per-table alignment (PR3): a target bàn that is `occupied`
  // is now a valid transfer destination — the order joins the existing
  // order(s) on that bàn. `reserved` and `maintenance` still excluded; the
  // bàn hiện tại always shows so cashier keeps it as a fallback option.
  const availableTables = tables.filter(
    (t) =>
      t.status === "available" ||
      t.status === "occupied" ||
      t.id === data?.table_id,
  );

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
  const canShowMoreMenu = canShowBillInMenu || canShowReorder || canShowCancel;
  const voidItem = data?.order_items.find((item) => item.id === voidItemId);
  const activeItemCount =
    data?.order_items.filter((item) => item.status !== "cancelled").length ?? 0;
  const sheetTitle = data?.order_number ?? orderNumber;
  const orderContextLabel = data
    ? data.order_type === "dine_in"
      ? `Bàn ${data.tables?.number ?? "—"}`
      : "Mang về"
    : null;

  return (
    <>
      <Sheet open={orderId !== null} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="flex w-full flex-col sm:max-w-md"
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
              <ScrollArea className="min-h-0 flex-1">
                <ul
                  className="flex flex-col gap-2 px-3 py-2 sm:px-4"
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
                Thử lại
              </Button>
            </div>
          )}

          {data && !error && (
            <>
              <ScrollArea className="min-h-0 flex-1">
                <ul
                  className="flex flex-col gap-2 px-3 py-2 sm:px-4"
                  aria-label="Danh sách món"
                >
                  {data.order_items.map((row) => (
                    <OrderItemRow
                      key={row.id}
                      row={row}
                      canManage={canManage}
                      onVoid={setVoidItemId}
                    />
                  ))}
                </ul>
                {data.note && (
                  <p className="px-3 text-sm text-muted-foreground sm:px-4">
                    <span className="font-medium text-foreground">
                      Ghi chú:{""}
                    </span>
                    {data.note}
                  </p>
                )}
              </ScrollArea>

              <div className="mt-auto flex shrink-0 flex-col gap-2 border-t px-3 py-3 sm:px-4">
                {canShowPaymentAction && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="w-full"
                      disabled={printPending}
                      onClick={() => void handlePrintProvisional()}
                    >
                      {printPending ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <IconReceipt data-icon="inline-start" />
                      )}
                      In phiếu tạm tính
                    </Button>
                    <Button
                      type="button"
                      size="lg"
                      className="w-full"
                      onClick={() => {
                        onOpenBill(data.id, data);
                        onClose();
                      }}
                    >
                      Thanh toán - {formatVND(data.total_amount)}
                    </Button>
                  </>
                )}

                {(canAppendOrderStatus(data.status) || canMarkServed) && (
                  <div className="flex gap-2">
                    {canAppendOrderStatus(data.status) && (
                      <Button
                        type="button"
                        variant="outline"
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
                        className="flex-1"
                        disabled={isPending}
                        onClick={() => void handleStatus("served")}
                      >
                        Đã phục vụ
                      </Button>
                    )}
                  </div>
                )}

                {canShowTransfer && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={isPending}
                    onClick={() => setShowTransfer(true)}
                  >
                    Chuyển bàn
                  </Button>
                )}

                {canShowMoreMenu && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 w-full text-muted-foreground"
                      >
                        <IconDots data-icon="inline-start" />
                        Khác…
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
                            Hóa đơn POS
                          </DropdownMenuItem>
                        )}
                        {canShowReorder && (
                          <DropdownMenuItem
                            onClick={() => void handleReorder()}
                          >
                            Tạo đơn mới từ đơn này
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuGroup>
                      {canShowCancel && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              variant="destructive"
                              disabled={isPending}
                              onClick={() => setShowCancel(true)}
                            >
                              Hủy đơn
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <VoidItemDialog
        open={voidItemId !== null}
        reason={voidReason}
        onReasonChange={setVoidReason}
        onCancel={() => setVoidItemId(null)}
        onConfirm={handleVoidConfirm}
        itemLabel={voidItem ? getPosLineItemDisplayName(voidItem) : null}
        isPending={isPending}
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
        isPending={isPending}
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
        isPending={isPending}
      />
    </>
  );
}
