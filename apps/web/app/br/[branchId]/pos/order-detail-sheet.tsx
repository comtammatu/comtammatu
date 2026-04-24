"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { formatVND } from "@comtammatu/shared/format";
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
import { Skeleton } from "@comtammatu/ui/components/skeleton";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { notify } from "@comtammatu/ui/lib/notify";
import { IconDots, IconReceipt } from "@tabler/icons-react";
import {
  fetchOrderDetail,
  voidOrderItem,
  cancelOrder,
  transferOrderTable,
  updateOrderStatus,
  fetchOrderItemsForReorder,
} from "./actions";
import type { CartItem } from "./types";
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
type OrderDetailData = Omit<OrderData, "order_items"> & {
  order_items: OrderItemRowData[];
};

function canAppendOrderStatus(status: string): boolean {
  return ["new", "confirmed", "preparing", "ready"].includes(status);
}

export interface OrderDetailSheetProps {
  orderId: number | null;
  orderNumber?: string | null;
  refreshToken?: number;
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
  onOrderUpdated?: () => void | Promise<void>;
}

export function OrderDetailSheet({
  orderId,
  orderNumber,
  refreshToken,
  onClose,
  onOpenBill,
  onStartAppend,
  onReorderToCart,
  tables,
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

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (orderId === null || refreshToken == null) return;
    load();
  }, [load, orderId, refreshToken]);

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  const handleVoidConfirm = () => {
    if (voidItemId === null) return;
    startTransition(async () => {
      const id = voidItemId;
      const r = await voidOrderItem(id, voidReason);
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
    startTransition(async () => {
      const r = await cancelOrder(orderId, cancelReason);
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

  const availableTables = tables.filter(
    (t) => t.status === "available" || t.id === data?.table_id,
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
  const canShowMoreMenu =
    canShowBillInMenu || canShowReorder || canShowTransfer || canShowCancel;
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
            <SheetTitle className="flex min-w-0 items-center gap-2 text-base">
              {orderContextLabel && <span>{orderContextLabel}</span>}
              {orderContextLabel && sheetTitle && (
                <span className="text-muted-foreground">·</span>
              )}
              <span className="truncate">
                {sheetTitle ? `#${sheetTitle}` : orderId !== null ? "Đơn" : ""}
              </span>
            </SheetTitle>
            <SheetDescription className="sr-only">
              Chi tiết đơn hàng, thêm món và cập nhật trạng thái phục vụ
            </SheetDescription>
          </SheetHeader>

          {isPending && !data && orderId !== null && (
            <>
              <ScrollArea className="min-h-0 flex-1">
                <ul
                  className="flex flex-col gap-2 px-3 py-2 sm:px-4"
                  aria-label="Đang tải danh sách món"
                >
                  {Array.from({ length: 5 }).map((_, index) => (
                    <li
                      key={index}
                      className="rounded-md border border-border bg-card px-2.5 py-2"
                    >
                      <div className="flex items-start gap-3">
                        <Skeleton className="mt-1 size-4 rounded-full" />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <Skeleton className="h-5 w-4/5" />
                          <Skeleton className="h-4 w-3/5" />
                          <Skeleton className="h-4 w-2/5" />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </ScrollArea>
              <div className="mt-auto flex shrink-0 flex-col gap-2 border-t px-3 py-3 sm:px-4">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-7 w-full" />
              </div>
              <span className="sr-only">Đang tải đơn hàng</span>
            </>
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
                      Ghi chú:{" "}
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
                        <Spinner className="mr-2" />
                      ) : (
                        <IconReceipt data-icon="inline-start" />
                      )}
                      In tạm tính
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
                        Phục vụ
                      </Button>
                    )}
                  </div>
                )}

                {canShowMoreMenu && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 w-full rounded-lg text-muted-foreground"
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
                            Xem hóa đơn
                          </DropdownMenuItem>
                        )}
                        {canShowReorder && (
                          <DropdownMenuItem
                            onClick={() => void handleReorder()}
                          >
                            Đặt lại vào giỏ
                          </DropdownMenuItem>
                        )}
                        {canShowTransfer && (
                          <DropdownMenuItem
                            disabled={isPending}
                            onClick={() => setShowTransfer(true)}
                          >
                            Chuyển bàn
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
      />

      <CancelOrderDialog
        open={showCancel}
        onOpenChange={setShowCancel}
        reason={cancelReason}
        onReasonChange={setCancelReason}
        onConfirm={handleCancelOrder}
      />

      <TransferTableDialog
        open={showTransfer}
        onOpenChange={setShowTransfer}
        tableId={transferTableId}
        onTableIdChange={setTransferTableId}
        currentTableId={data?.table_id ?? null}
        availableTables={availableTables}
        onConfirm={handleTransfer}
      />
    </>
  );
}
