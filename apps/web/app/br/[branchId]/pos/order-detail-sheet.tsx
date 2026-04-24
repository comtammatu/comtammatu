"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { cn } from "@comtammatu/ui";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { Card, CardContent } from "@comtammatu/ui/components/card";
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
import { Badge } from "@comtammatu/ui/components/badge";
import { Spinner } from "@comtammatu/ui/components/spinner";
import { notify } from "@comtammatu/ui/lib/notify";
import { IconDots } from "@tabler/icons-react";
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
import { OrderItemRow } from "./_components/order-detail/order-item-row";
import type { OrderItemRowData } from "./_components/order-detail/order-item-row";
import { VoidItemDialog } from "./_components/order-detail/void-item-dialog";
import { CancelOrderDialog } from "./_components/order-detail/cancel-order-dialog";
import { TransferTableDialog } from "./_components/order-detail/transfer-table-dialog";

interface OrderDetailData {
  id: number;
  order_number: string;
  order_type: string;
  status: string;
  payment_status: string | null;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  note: string | null;
  table_id: number | null;
  tables: { number: number } | null;
  order_items: OrderItemRowData[];
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  new: "Mới",
  confirmed: "Đã xác nhận",
  preparing: "Đang làm",
  ready: "Sẵn sàng",
  served: "Đã phục vụ",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};

function canAppendOrderStatus(status: string): boolean {
  return ["new", "confirmed", "preparing", "ready"].includes(status);
}

export interface OrderDetailSheetProps {
  orderId: number | null;
  refreshToken?: number;
  onClose: () => void;
  onOpenBill: (orderId: number) => void;
  /** Start append flow: parent closes sheet and sets append target on menu */
  onStartAppend: (orderId: number, orderNumber: string) => void;
  onReorderToCart: (items: CartItem[], skippedCount: number) => void;
  tables: BranchTable[];
  onOrderUpdated?: () => void | Promise<void>;
}

export function OrderDetailSheet({
  orderId,
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

  const handleStatus = (next: "served" | "completed") => {
    if (orderId === null) return;
    startTransition(async () => {
      const r = await updateOrderStatus(orderId, next);
      if (r.success) {
        notify.success(
          next === "served"
            ? messages.pos.order.markedServed
            : messages.pos.order.completed,
        );
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

  const orderStatusLabel = data
    ? (ORDER_STATUS_LABEL[data.status] ?? data.status)
    : "";

  const availableTables = tables.filter(
    (t) => t.status === "available" || t.id === data?.table_id,
  );

  const canShowCancel =
    canManage && data && !["completed", "cancelled"].includes(data.status);
  const canShowTransfer =
    data?.order_type === "dine_in" && data.status !== "cancelled";
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
  const canCompletePaidServed =
    data != null && data.status === "served" && data.payment_status === "paid";
  const canShowMoreMenu =
    canShowBillInMenu || canShowReorder || canShowTransfer || canShowCancel;

  return (
    <>
      <Sheet open={orderId !== null} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader className="text-left">
            <SheetTitle>
              {data
                ? `Đơn #${data.order_number}`
                : orderId !== null
                  ? "Chi tiết đơn"
                  : ""}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Chi tiết đơn hàng, thêm món và cập nhật trạng thái phục vụ
            </SheetDescription>
          </SheetHeader>

          {isPending && !data && orderId !== null && (
            <div className="flex flex-1 items-center justify-center py-12">
              <Spinner className="size-8 text-muted-foreground" />
              <span className="sr-only">Đang tải đơn hàng</span>
            </div>
          )}

          {error && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-destructive">{error}</p>
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
              <Card size="sm" className="shrink-0">
                <CardContent className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{orderStatusLabel}</Badge>
                      <Badge variant="outline">
                        {data.order_type === "dine_in"
                          ? `Bàn ${data.tables?.number ?? "—"}`
                          : "Mang về"}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          data.payment_status === "paid"
                            ? "border-success/20 bg-success/10 text-success"
                            : "border-warning/20 bg-warning/10 text-warning",
                        )}
                      >
                        {data.payment_status === "paid"
                          ? "Đã thanh toán"
                          : "Chưa thanh toán"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {data.order_items.length} món trong đơn
                    </p>
                  </div>
                  <p className="shrink-0 text-lg font-bold text-primary tabular-nums">
                    {formatVND(data.total_amount)}
                  </p>
                </CardContent>
              </Card>

              <ScrollArea className="min-h-0 flex-1 pr-2">
                <ul
                  className="flex flex-col gap-2 py-2"
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
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Ghi chú:{" "}
                    </span>
                    {data.note}
                  </p>
                )}
              </ScrollArea>

              <div className="mt-auto flex shrink-0 flex-col gap-2 border-t pt-3">
                {canShowPaymentAction && (
                  <Button
                    type="button"
                    size="lg"
                    className="w-full"
                    onClick={() => {
                      onOpenBill(data.id);
                      onClose();
                    }}
                  >
                    Thanh toán
                  </Button>
                )}

                {(canAppendOrderStatus(data.status) ||
                  canMarkServed ||
                  canCompletePaidServed) && (
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
                    {canCompletePaidServed && (
                      <Button
                        type="button"
                        variant="secondary"
                        className="flex-1"
                        disabled={isPending}
                        onClick={() => void handleStatus("completed")}
                      >
                        {data.order_type === "dine_in"
                          ? "Hoàn tất và trả bàn"
                          : "Hoàn tất đơn"}
                      </Button>
                    )}
                  </div>
                )}

                {data.status === "served" && data.payment_status !== "paid" && (
                  <p className="text-center text-xs text-muted-foreground">
                    Thanh toán trước khi hoàn tất đơn và trả bàn.
                  </p>
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
                              onOpenBill(data.id);
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
