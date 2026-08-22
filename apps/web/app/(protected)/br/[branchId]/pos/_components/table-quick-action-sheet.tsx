"use client";

import { memo } from "react";
import { StationSheet } from "@/components/surface";
import { Button } from "@comtammatu/ui/components/button";
import { Badge } from "@comtammatu/ui/components/badge";
import { Item } from "@comtammatu/ui/components/item";
import { TABLE_VI, POS_VI } from "@comtammatu/shared/messages";
import { messages } from "@lib/messages";
import {
  ArrowRightLeft as IconArrowRightLeft,
  CreditCard as IconCreditCard,
  FileText as IconFileText,
  PlusCircle as IconPlusCircle,
  Printer as IconPrinter,
} from "lucide-react";
import type { BranchTable } from "../page";
import type { SessionOrder } from "../order-history";

interface TableQuickActionSheetProps {
  table: BranchTable | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeOrder?: SessionOrder | null;
  orderCount?: number;
  onOpenBill?: (orderId: number) => void;
  onOpenDetail?: (orderId: number, orderNumber: string) => void;
  onStartAppend?: (
    orderId: number,
    orderNumber: string,
    tableNumber: number | string,
  ) => void;
  onTransferTable?: (orderId: number, tableNumber: number) => void;
  onStartNewOrder?: (tableId: number) => void;
  onPrintProvisional?: (orderId: number) => void;
}

function TableQuickActionSheetComponent({
  table,
  open,
  onOpenChange,
  activeOrder,
  orderCount = 0,
  onOpenBill,
  onOpenDetail,
  onStartAppend,
  onTransferTable,
  onStartNewOrder,
  onPrintProvisional,
}: TableQuickActionSheetProps) {
  if (!table) return null;

  const isOccupied = table.status === "occupied" || orderCount > 0;
  const tableTitle = `${TABLE_VI.long} ${table.number}`;

  return (
    <StationSheet
      open={open}
      onOpenChange={onOpenChange}
      title={tableTitle}
      side="bottom"
      footer={
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="w-full"
          onClick={() => onOpenChange(false)}
        >
          {POS_VI.keepCurrentTable}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="font-heading text-lg text-foreground">
              {tableTitle}
            </span>
            <Badge
              variant={isOccupied ? "warning" : "success"}
              className="text-xs font-semibold"
            >
              {isOccupied
                ? messages.pos.tableQuickActions.occupiedBadge
                : messages.pos.tableQuickActions.availableBadge}
            </Badge>
          </div>
          {orderCount > 1 ? (
            <Badge variant="secondary" className="text-xs font-medium">
              {messages.pos.tableQuickActions.ordersCount(orderCount)}
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-col gap-2">
          {isOccupied && activeOrder ? (
            <>
              <Item
                variant="outline"
                className="hover:border-primary hover:bg-accent"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  className="h-auto w-full justify-start gap-3 px-3 py-3 text-left"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenBill?.(activeOrder.id);
                  }}
                >
                  <IconCreditCard className="size-5 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-foreground">
                      {messages.pos.tableQuickActions.payTitle}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {messages.pos.tableQuickActions.payDesc(
                        activeOrder.order_number,
                      )}
                    </p>
                  </div>
                </Button>
              </Item>

              <Item
                variant="outline"
                className="hover:border-primary hover:bg-accent"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  className="h-auto w-full justify-start gap-3 px-3 py-3 text-left"
                  onClick={() => {
                    onOpenChange(false);
                    onPrintProvisional?.(activeOrder.id);
                  }}
                >
                  <IconPrinter className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-foreground">
                      {messages.pos.tableQuickActions.printProvisionalTitle}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {messages.pos.tableQuickActions.printProvisionalDesc}
                    </p>
                  </div>
                </Button>
              </Item>

              <Item
                variant="outline"
                className="hover:border-primary hover:bg-accent"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  className="h-auto w-full justify-start gap-3 px-3 py-3 text-left"
                  onClick={() => {
                    onOpenChange(false);
                    onStartAppend?.(
                      activeOrder.id,
                      activeOrder.order_number,
                      table.number,
                    );
                  }}
                >
                  <IconPlusCircle className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-foreground">
                      {messages.pos.tableQuickActions.appendTitle}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {messages.pos.tableQuickActions.appendDesc(
                        activeOrder.order_number,
                      )}
                    </p>
                  </div>
                </Button>
              </Item>

              <Item
                variant="outline"
                className="hover:border-primary hover:bg-accent"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  className="h-auto w-full justify-start gap-3 px-3 py-3 text-left"
                  onClick={() => {
                    onOpenChange(false);
                    onTransferTable?.(activeOrder.id, table.number);
                  }}
                >
                  <IconArrowRightLeft className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-foreground">
                      {messages.pos.tableQuickActions.transferTitle}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {messages.pos.tableQuickActions.transferDesc(table.number)}
                    </p>
                  </div>
                </Button>
              </Item>

              <Item
                variant="outline"
                className="hover:border-primary hover:bg-accent"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  className="h-auto w-full justify-start gap-3 px-3 py-3 text-left"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenDetail?.(activeOrder.id, activeOrder.order_number);
                  }}
                >
                  <IconFileText className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold text-foreground">
                      {messages.pos.tableQuickActions.detailTitle}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {messages.pos.tableQuickActions.detailDesc}
                    </p>
                  </div>
                </Button>
              </Item>
            </>
          ) : (
            <Item
              variant="outline"
              className="hover:border-primary hover:bg-accent"
            >
              <Button
                type="button"
                variant="ghost"
                size="touch"
                className="h-auto w-full justify-start gap-3 px-3 py-3 text-left"
                onClick={() => {
                  onOpenChange(false);
                  onStartNewOrder?.(table.id);
                }}
              >
                <IconPlusCircle className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-foreground">
                    {messages.pos.tableQuickActions.newOrderTitle(table.number)}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {messages.pos.tableQuickActions.newOrderDesc}
                  </p>
                </div>
              </Button>
            </Item>
          )}
        </div>
      </div>
    </StationSheet>
  );
}

export const TableQuickActionSheet = memo(TableQuickActionSheetComponent);
