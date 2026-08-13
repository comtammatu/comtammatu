"use client";

import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemContent,
  ItemFooter,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { formatVND } from "@comtammatu/shared/format";
import {
  ClipboardList as IconClipboardList,
  CreditCard as IconCreditCard,
  Plus as IconPlus,
} from "lucide-react";
import { ACTIVE_POS_STATUSES, type SessionOrder } from "../order-history";
import { getPosOrderStatusInfo } from "../_lib/order-status-display";
import { canAppendPosOrder } from "../_lib/table-order-visual-state";
import { messages } from "@lib/messages";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
import {
  AppDrawer,
} from "@/components/surface";

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
    <AppDrawer
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={messages.pos.multiOrderTablePicker.title(
        tableNumber,
        orders.length,
      )}
      description={messages.pos.multiOrderTablePicker.description}
      contentClassName="mx-auto flex max-h-dvh-80 w-full max-w-md flex-col overflow-hidden sm:max-w-lg"
      footerClassName="pos-safe-bottom shrink-0"
      footer={
        <div data-testid="pos-multi-order-footer">
          <Button
            type="button"
            variant="default"
            size="touch"
            className="w-full"
            onClick={onCreateNew}
          >
            <IconPlus data-icon="inline-start" />
            {messages.pos.multiOrderTablePicker.createNew(tableNumber)}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="touch"
            onClick={onClose}
          >
            {ACTIONS_VI.close}
          </Button>
        </div>
      }
    >
      <div data-testid="pos-multi-order-picker">
          <div
            className="flex flex-col gap-3 pr-2 pb-2"
            data-testid="pos-multi-order-list"
          >
            {orders.map((order) => {
              const statusInfo = getPosOrderStatusInfo(order);
              const canAppendItems = canAppendPosOrder(
                order,
                ACTIVE_POS_STATUSES,
              );
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
                      disabled={!canAppendItems}
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
      </div>
    </AppDrawer>
  );
}
