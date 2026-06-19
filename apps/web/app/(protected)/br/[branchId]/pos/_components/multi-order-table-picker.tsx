"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemFooter,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@comtammatu/ui/components/drawer";
import { ScrollArea } from "@comtammatu/ui/components/scroll-area";
import { formatVND } from "@comtammatu/shared/format";
import {
  ClipboardList as IconClipboardList,
  CreditCard as IconCreditCard,
  Plus as IconPlus,
} from "lucide-react";
import type { SessionOrder } from "../order-history";
import { getPosOrderStatusInfo } from "../_lib/order-status-display";
import { messages } from "@lib/messages";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
interface MultiOrderTablePickerProps {
  open: boolean;
  tableNumber: number | null;
  orders: SessionOrder[];
  onOpenOrder: (orderId: number, orderNumber: string) => void;
  onPayOrder: (orderId: number) => void;
  onAppendOrder: (orderId: number, orderNumber: string) => void;
  onCreateNew: () => void;
  onClose: () => void;
}

export function MultiOrderTablePicker({
  open,
  tableNumber,
  orders,
  onOpenOrder,
  onPayOrder,
  onAppendOrder,
  onCreateNew,
  onClose,
}: MultiOrderTablePickerProps) {
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent
        className="mx-auto w-full max-w-md overflow-hidden sm:max-w-lg"
        data-testid="pos-multi-order-picker"
      >
        <DrawerHeader className="shrink-0">
          <DrawerTitle>
            {messages.pos.multiOrderTablePicker.title(
              tableNumber,
              orders.length,
            )}
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            {messages.pos.multiOrderTablePicker.description}
          </DrawerDescription>
        </DrawerHeader>

        <ScrollArea
          className="h-64 min-h-0 overflow-hidden px-4 sm:h-72"
          data-testid="pos-multi-order-list"
        >
          <div className="flex flex-col gap-2 pr-2 pb-2" data-vaul-no-drag>
            {orders.map((order) => {
              const statusInfo = getPosOrderStatusInfo(order);
              return (
                <Item
                  key={order.id}
                  data-testid={`pos-multi-order-card-${order.id}`}
                  variant="outline"
                  size="sm"
                  className="bg-card"
                >
                  <ItemContent className="w-full min-w-0 gap-1">
                    <ItemTitle className="w-full min-w-0 justify-between gap-3 text-base">
                      <span className="min-w-0 truncate">
                        #{order.order_number}
                      </span>
                      <span className="shrink-0 text-right font-bold tabular-nums text-primary">
                        {formatVND(order.total_amount)}
                      </span>
                    </ItemTitle>
                    <div className="flex items-center justify-end gap-2">
                      <Badge
                        variant={statusInfo.variant}
                        className="w-fit text-xs tabular-nums"
                      >
                        {statusInfo.label}
                      </Badge>
                    </div>
                  </ItemContent>
                  <ItemFooter className="mt-1.5 grid grid-cols-1 gap-2 border-t border-border/60 pt-2 sm:grid-cols-3">
                    <Button
                      type="button"
                      variant="default"
                      size="touch"
                      className="px-2 text-sm"
                      onClick={() => onOpenOrder(order.id, order.order_number)}
                    >
                      <IconClipboardList data-icon="inline-start" />
                      {messages.pos.multiOrderTablePicker.handle}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="touch"
                      className="px-2 text-sm"
                      onClick={() =>
                        onAppendOrder(order.id, order.order_number)
                      }
                    >
                      <IconPlus data-icon="inline-start" />
                      {messages.pos.multiOrderTablePicker.appendItems}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="touch"
                      className="px-2 text-sm"
                      onClick={() => onPayOrder(order.id)}
                    >
                      <IconCreditCard data-icon="inline-start" />
                      {messages.pos.multiOrderTablePicker.payment}
                    </Button>
                  </ItemFooter>
                </Item>
              );
            })}
          </div>
        </ScrollArea>

        <DrawerFooter
          className="pos-safe-bottom shrink-0"
          data-testid="pos-multi-order-footer"
        >
          <Button
            type="button"
            variant="default"
            className="w-full"
            onClick={onCreateNew}
          >
            <IconPlus data-icon="inline-start" />
            {messages.pos.multiOrderTablePicker.createNew(tableNumber)}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            {ACTIONS_VI.close}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
