"use client";

import { useState } from "react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@comtammatu/ui/components/tabs";
import { Textarea } from "@comtammatu/ui/components/textarea";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@comtammatu/ui/components/alert-dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Kbd, KbdGroup } from "@comtammatu/ui/components/kbd";
import { Spinner } from "@comtammatu/ui/components/spinner";
import {
  IconPackage,
  IconShoppingCart,
  IconTrash,
  IconToolsKitchen,
} from "@tabler/icons-react";
import { formatVND } from "@comtammatu/shared/format";
import { useKeyboardShortcut } from "@/_lib/use-keyboard-shortcut";
import type { CartItem, OrderType } from "../../pos/types";
import type { BranchTable } from "../../pos/page";
import type { SessionOrder } from "../../pos/order-history";
import { SwipeableCartItem } from "./swipeable-cart-item";
import { OrderTimeline } from "./order-timeline";

interface PosV2SidebarProps {
  tab: "cart" | "orders";
  onTabChange: (tab: "cart" | "orders") => void;
  cartItems: CartItem[];
  cartTotal: number;
  cartQuantity: number;
  orderType: OrderType;
  selectedTableId: number | null;
  tables: BranchTable[];
  canSubmit: boolean;
  isPending: boolean;
  sessionOrders: SessionOrder[];
  orderNote: string;
  onIncrement: (key: string) => void;
  onDecrement: (key: string) => void;
  onRemoveItem: (key: string) => void;
  onClearCart: () => void;
  onOrderTypeChange: (type: OrderType) => void;
  onRequestChangeTable: () => void;
  onSubmitOrder: () => void;
  onOrderNoteChange: (note: string) => void;
  onViewBill: (orderId: number) => void;
  onViewDetail: (orderId: number) => void;
  /** Hide the order-type + change-table block when the page already shows it. */
  hideContextBlock?: boolean;
}

export function PosV2Sidebar(props: PosV2SidebarProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <TabsHeader
        tab={props.tab}
        onTabChange={props.onTabChange}
        cartQuantity={props.cartQuantity}
        activeOrderCount={props.sessionOrders.length}
      />
      {props.tab === "orders" ? (
        <OrdersPanel
          orders={props.sessionOrders}
          onViewBill={props.onViewBill}
          onViewDetail={props.onViewDetail}
        />
      ) : (
        <CartPanel {...props} />
      )}
    </div>
  );
}

function TabsHeader({
  tab,
  onTabChange,
  cartQuantity,
  activeOrderCount,
}: {
  tab: "cart" | "orders";
  onTabChange: (tab: "cart" | "orders") => void;
  cartQuantity: number;
  activeOrderCount: number;
}) {
  return (
    <div className="shrink-0 border-b border-border/60 px-4 py-3">
      <Tabs
        value={tab}
        onValueChange={(v) => onTabChange(v === "orders" ? "orders" : "cart")}
        className="w-full gap-0"
      >
        <TabsList
          aria-label="POS sidebar"
          style={{ height: "auto" }}
          className="grid w-full grid-cols-2 gap-1 rounded-lg border bg-card p-1"
        >
          <TabsTrigger
            value="cart"
            className="min-h-10 gap-1.5 py-2 text-xs font-semibold sm:text-sm"
          >
            <span className="truncate">Giỏ mới</span>
            {cartQuantity > 0 && (
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {cartQuantity}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="orders"
            className="min-h-10 gap-1.5 py-2 text-xs font-semibold sm:text-sm"
          >
            <span className="truncate">Đơn đang phục vụ</span>
            {activeOrderCount > 0 && (
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {activeOrderCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}

function OrdersPanel({
  orders,
  onViewBill,
  onViewDetail,
}: {
  orders: SessionOrder[];
  onViewBill: (orderId: number) => void;
  onViewDetail: (orderId: number) => void;
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Timeline đơn</span>
          {orders.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {orders.length}
            </Badge>
          )}
        </div>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Tự cập nhật
        </span>
      </div>
      <OrderTimeline
        orders={orders}
        onViewBill={onViewBill}
        onViewDetail={onViewDetail}
      />
    </div>
  );
}

function CartPanel({
  cartItems,
  cartTotal,
  cartQuantity,
  orderType,
  selectedTableId,
  tables,
  canSubmit,
  isPending,
  orderNote,
  onIncrement,
  onDecrement,
  onRemoveItem,
  onClearCart,
  onOrderTypeChange,
  onRequestChangeTable,
  onSubmitOrder,
  onOrderNoteChange,
  hideContextBlock,
}: PosV2SidebarProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const dialogOpen = confirmOpen || clearConfirmOpen;
  const selectedTableNumber =
    selectedTableId != null
      ? tables.find((t) => t.id === selectedTableId)?.number
      : undefined;
  const contextLabel =
    orderType === "takeaway"
      ? "Mang về"
      : selectedTableNumber != null
        ? `Bàn ${selectedTableNumber}`
        : "Chưa chọn bàn";

  useKeyboardShortcut([
    {
      key: "Enter",
      meta: true,
      fireInInput: true,
      preventDefault: true,
      handler: () => {
        if (!dialogOpen && canSubmit && !isPending) setConfirmOpen(true);
      },
    },
    {
      key: "t",
      handler: () => {
        if (!dialogOpen) onOrderTypeChange("takeaway");
      },
    },
    {
      key: "d",
      handler: () => {
        if (!dialogOpen) onOrderTypeChange("dine_in");
      },
    },
  ]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {!hideContextBlock && (
        <div className="border-b border-border/60 px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Đơn mới
              </p>
              <h2 className="mt-1 truncate text-xl font-semibold tracking-tight">
                {contextLabel}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {cartItems.length > 0
                  ? `${String(cartQuantity)} món đang chờ gửi bếp`
                  : "Chọn món từ menu để bắt đầu"}
              </p>
            </div>
            <Badge variant={canSubmit ? "success" : "outline"}>
              {canSubmit ? "Gửi được" : "Đang tạo"}
            </Badge>
          </div>

          <ToggleGroup
            type="single"
            value={orderType}
            variant="outline"
            size="lg"
            className="mt-4 grid w-full grid-cols-2 gap-2"
            onValueChange={(value) => {
              if (value === "dine_in" || value === "takeaway") {
                onOrderTypeChange(value);
              }
            }}
          >
            <ToggleGroupItem
              value="dine_in"
              className="min-h-12 justify-center gap-2 rounded-lg text-sm font-semibold"
              aria-keyshortcuts="D"
            >
              <IconToolsKitchen className="size-4" />
              Tại bàn
              <Kbd className="ml-1 hidden md:inline-flex">D</Kbd>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="takeaway"
              className="min-h-12 justify-center gap-2 rounded-lg text-sm font-semibold"
              aria-keyshortcuts="T"
            >
              <IconPackage className="size-4" />
              Mang về
              <Kbd className="ml-1 hidden md:inline-flex">T</Kbd>
            </ToggleGroupItem>
          </ToggleGroup>

          {orderType === "dine_in" && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-9 w-full rounded-lg text-xs"
              type="button"
              onClick={onRequestChangeTable}
            >
              {selectedTableNumber != null
                ? `Đổi bàn (hiện: Bàn ${String(selectedTableNumber)})`
                : "Chọn bàn"}
            </Button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <IconShoppingCart className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Giỏ thao tác</p>
            <p className="text-xs text-muted-foreground">
              {cartItems.length === 0
                ? "Chưa có món"
                : `${String(cartQuantity)} món`}
            </p>
          </div>
        </div>
        {cartItems.length > 0 && (
          <AlertDialog
            open={clearConfirmOpen}
            onOpenChange={setClearConfirmOpen}
          >
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-11 min-w-11 h-9 rounded-full px-3 text-xs text-muted-foreground"
              >
                <IconTrash className="mr-1 size-3.5" />
                Xóa giỏ
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Xóa giỏ hàng?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tất cả {cartItems.length} món sẽ bị xóa khỏi giỏ. Hành động
                  này không thể hoàn tác.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Hủy</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    onClearCart();
                    setClearConfirmOpen(false);
                  }}
                >
                  Xóa tất cả
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {cartItems.length === 0 ? (
        <div className="flex flex-1 flex-col p-4">
          <Empty className="py-12">
            <EmptyMedia variant="icon">
              <IconShoppingCart />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>Giỏ đang trống</EmptyTitle>
              <EmptyDescription>
                Chạm món ở khu thực đơn để đưa vào đơn mới.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-3 p-4" role="list">
            {cartItems.map((item) => (
              <SwipeableCartItem
                key={item.key}
                item={item}
                onIncrement={() => onIncrement(item.key)}
                onDecrement={() => onDecrement(item.key)}
                onRemove={() => onRemoveItem(item.key)}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      <div className="border-t border-border/60 bg-background px-4 py-4">
        {cartItems.length > 0 && (
          <div className="mb-4 flex flex-col gap-1.5">
            <label
              htmlFor="pos-v2-order-note"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Ghi chú đơn
            </label>
            <Textarea
              id="pos-v2-order-note"
              value={orderNote}
              onChange={(e) => onOrderNoteChange(e.target.value)}
              placeholder="Ví dụ: ít đường, không hành…"
              maxLength={500}
              rows={2}
              className="resize-none rounded-lg text-sm"
            />
          </div>
        )}

        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Tổng tạm tính
              </p>
              <p className="mt-1 text-2xl font-bold text-primary tabular-nums">
                {formatVND(cartTotal)}
              </p>
            </div>
            <Badge variant={canSubmit ? "success" : "warning"}>
              {canSubmit ? "Sẵn sàng" : "Chờ thông tin"}
            </Badge>
          </div>

          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger asChild>
              <Button
                className={cn(
                  "min-h-14 mt-3 w-full rounded-xl text-base font-bold tracking-wide shadow-md",
                )}
                size="lg"
                disabled={!canSubmit || isPending}
                aria-keyshortcuts="Meta+Enter Control+Enter"
              >
                {isPending ? (
                  <>
                    <Spinner className="mr-2 size-5" />
                    Đang xử lý...
                  </>
                ) : (
                  <>
                    Đặt món
                    <KbdGroup className="ml-2 hidden md:inline-flex">
                      <Kbd>⌘</Kbd>
                      <Kbd>Enter</Kbd>
                    </KbdGroup>
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Xác nhận gửi đơn</AlertDialogTitle>
                <AlertDialogDescription>
                  {orderType === "takeaway"
                    ? `Đơn mang về gồm ${String(cartQuantity)} món, tạm tính ${formatVND(cartTotal)}.`
                    : `Đơn tại bàn ${selectedTableNumber != null ? String(selectedTableNumber) : "đã chọn"} gồm ${String(cartQuantity)} món, tạm tính ${formatVND(cartTotal)}.`}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Quay lại</AlertDialogCancel>
                <AlertDialogAction onClick={onSubmitOrder}>
                  Gửi đơn
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {!canSubmit && cartItems.length > 0 && orderType === "dine_in" && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Vui lòng chọn bàn để hoàn tất đơn tại chỗ.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
