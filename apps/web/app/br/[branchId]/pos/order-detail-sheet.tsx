"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { cn } from "@comtammatu/ui";
import { formatVND } from "@comtammatu/shared/format";
import { Button } from "@comtammatu/ui/components/button";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Progress } from "@comtammatu/ui/components/progress";
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
  DropdownMenuItem,
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
import { sendToKitchen } from "./print-actions";
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

function computeOrderProgress(status: string): number {
  switch (status) {
    case "completed":
      return 100;
    case "cancelled":
      return 100;
    case "served":
      return 84;
    case "ready":
      return 70;
    case "preparing":
      return 52;
    case "confirmed":
      return 38;
    default:
      return 22;
  }
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

  const handleSendKitchen = () => {
    if (orderId === null) return;
    startTransition(async () => {
      const r = await sendToKitchen(orderId);
      if (r.success && r.data) {
        const slots = r.data.jobs.length;
        if (slots === 0) {
          notify.info("Không có món mới cần gửi bếp");
        } else {
          notify.success(`Đã gửi bếp (lần ${r.data.send_seq}, ${slots} tem)`);
        }
        await onOrderUpdated?.();
        load();
      } else {
        notify.error(r.error ?? "Không thể gửi bếp");
      }
    });
  };

  const orderStatusLabel = data
    ? (ORDER_STATUS_LABEL[data.status] ?? data.status)
    : "";
  const orderProgressPercent = data ? computeOrderProgress(data.status) : 0;

  const availableTables = tables.filter(
    (t) => t.status === "available" || t.id === data?.table_id,
  );

  const canShowCancel =
    canManage && data && !["completed", "cancelled"].includes(data.status);
  const canShowTransfer = data?.order_type === "dine_in" && data.status !== "cancelled";

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
              <div className="border-b pb-3">
                <div className="rounded-lg border bg-card shadow-sm p-4">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">{orderStatusLabel}</Badge>
                          <Badge variant="outline">
                            {data.order_type === "dine_in"
                              ? `Bàn ${data.tables?.number ?? "—"}`
                              : "Mang về"}
                          </Badge>
                          <Badge variant="outline">
                            {data.order_items.length} món
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
                        <p className="text-lg font-semibold tracking-tight">
                          #{data.order_number}
                        </p>
                        <p className="text-sm leading-6 text-muted-foreground">
                          {data.status === "served"
                            ? "Đơn đã phục vụ, có thể chuyển sang thanh toán hoặc hoàn tất."
                            : data.status === "completed"
                              ? "Đơn đã kết thúc, kiểm tra hóa đơn hoặc tra cứu lại khi cần."
                              : data.status === "cancelled"
                                ? "Đơn đã hủy, chỉ còn thao tác tra cứu và đối soát."
                                : "Theo dõi món, thêm món hoặc cập nhật phục vụ trong cùng một màn hình."}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Tổng đơn
                        </p>
                        <p className="mt-1 text-2xl font-bold text-primary tabular-nums">
                          {formatVND(data.total_amount)}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                        <span>Tiến độ phục vụ</span>
                        <span>{String(Math.round(orderProgressPercent))}%</span>
                      </div>
                      <Progress value={orderProgressPercent} className="h-2" />
                    </div>
                  </div>
                </div>
              </div>

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

              <div className="pb-2">
                <div className="rounded-lg border bg-card shadow-sm p-4">
                  <div className="relative space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Tạm tính</span>
                      <span>{formatVND(data.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-base font-bold">
                      <span>Tổng cộng</span>
                      <span className="text-primary">
                        {formatVND(data.total_amount)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-auto flex flex-col gap-2 border-t pt-3">
                {data.status !== "cancelled" && (
                  <Button
                    type="button"
                    size="lg"
                    className="min-h-11 w-full rounded-lg shadow-sm transition-transform hover:-translate-y-0.5"
                    onClick={() => {
                      onOpenBill(data.id);
                      onClose();
                    }}
                  >
                    {data.payment_status === "paid"
                      ? "Xem hóa đơn"
                      : "Hóa đơn / thanh toán"}
                  </Button>
                )}

                {canAppendOrderStatus(data.status) && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11 flex-1 rounded-lg shadow-sm transition-transform hover:-translate-y-0.5"
                      onClick={() => {
                        onStartAppend(data.id, data.order_number);
                      }}
                    >
                      Thêm món
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isPending}
                      className="min-h-11 flex-1 rounded-lg shadow-sm transition-transform hover:-translate-y-0.5"
                      onClick={handleSendKitchen}
                      title="Phiếu bếp đã tự gửi khi đặt món. Nhấn để gửi lại nếu cần."
                    >
                      Gửi lại bếp
                    </Button>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {["new", "confirmed", "preparing", "ready"].includes(
                    data.status,
                  ) && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11 flex-1 rounded-lg"
                      disabled={isPending}
                      onClick={() => void handleStatus("served")}
                    >
                      Phục vụ
                    </Button>
                  )}
                  {data.status === "served" && data.payment_status === "paid" && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-11 flex-1 rounded-lg"
                      disabled={isPending}
                      onClick={() => void handleStatus("completed")}
                    >
                      {data.order_type === "dine_in"
                        ? "Hoàn tất và trả bàn"
                        : "Hoàn tất đơn"}
                    </Button>
                  )}
                </div>

                {data.status === "served" && data.payment_status !== "paid" && (
                  <p className="text-center text-xs text-muted-foreground">
                    Thanh toán trước khi hoàn tất đơn và trả bàn.
                  </p>
                )}

                {(canShowTransfer || canShowCancel) && (
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    {canShowTransfer && (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 flex-1 rounded-lg"
                        disabled={isPending}
                        onClick={() => setShowTransfer(true)}
                      >
                        Chuyển bàn
                      </Button>
                    )}
                    {canShowCancel && (
                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 flex-1 rounded-lg border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={isPending}
                        onClick={() => setShowCancel(true)}
                      >
                        Hủy đơn
                      </Button>
                    )}
                  </div>
                )}

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 w-full rounded-lg text-muted-foreground"
                    >
                      <IconDots className="mr-2 size-4" />
                      Khác…
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      onClick={() => {
                        onOpenBill(data.id);
                        onClose();
                      }}
                    >
                      Hóa đơn / thanh toán
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => void handleReorder()}>
                      Đặt lại vào giỏ
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
