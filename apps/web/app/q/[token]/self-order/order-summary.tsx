"use client";

import { Check as IconCheck, Clock as IconClock } from "lucide-react";
import { formatSidePortionLabel, formatVND } from "@comtammatu/shared/format";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemFooter,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { BrandMascot } from "@/components/brand";
import { AppEmptyState } from "@/components/surface";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/data-table/data-table";
import type {
  SelfOrderCartItem,
  SelfOrderOrderLine,
} from "@lib/self-order/contracts";

interface OrderSummaryProps {
  pendingItems?: Array<Omit<SelfOrderCartItem, "key"> & { key?: string }>;
  items?: SelfOrderOrderLine[];
}

export interface BillRow {
  key: string;
  label: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  modifiers: SelfOrderOrderLine["modifiers"];
  sides: SelfOrderOrderLine["sides"];
  note: string | null;
}

export function buildBillRow(item: SelfOrderOrderLine): BillRow {
  return {
    key: `item-${String(item.id)}`,
    label: item.variantName
      ? `${item.itemName} ${item.variantName}`
      : item.itemName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
    modifiers: item.modifiers,
    sides: item.sides,
    note: item.note,
  };
}

export function buildBillRows(item: SelfOrderOrderLine): BillRow[] {
  return [buildBillRow(item)];
}

function optionSummary(item: {
  modifiers: { name: string }[];
  sides: { name: string; quantity: number }[];
  note?: string | null;
}) {
  return [
    ...item.modifiers.map((modifier) => modifier.name),
    ...item.sides.map((side) =>
      formatSidePortionLabel(side.name, side.quantity),
    ),
    item.note ? `${SELF_ORDER_VI.itemNoteLabel}: ${item.note}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const BILL_COLUMNS: DataTableColumn<BillRow>[] = [
  {
    key: "item",
    header: SELF_ORDER_VI.billItemColumn,
    className: "min-w-0 text-xs",
    render: (row) => (
      <div className="min-w-0 break-words leading-snug">
        <div className="font-medium text-foreground">{row.label}</div>
        {row.modifiers.length > 0 || row.sides.length > 0 ? (
          <div className="mt-1 flex flex-col gap-1 border-l-2 border-border/50 pl-2 text-2xs text-muted-foreground">
            {row.modifiers.map((modifier) => (
              <div
                key={`mod-${modifier.modifier_id}`}
                className="flex items-center justify-between gap-2"
              >
                <span>+ {modifier.name}</span>
                {modifier.price > 0 ? (
                  <span className="font-mono tabular-nums">
                    +{formatVND(modifier.price * row.quantity)}
                  </span>
                ) : null}
              </div>
            ))}
            {row.sides.map((side) => {
              const totalSideQty = side.quantity * row.quantity;
              const sideAmt =
                side.price > 0 && totalSideQty > 0
                  ? side.price * totalSideQty
                  : 0;
              return (
                <div
                  key={`side-${side.side_item_id}`}
                  className="flex items-center justify-between gap-2"
                >
                  <span>
                    + {formatSidePortionLabel(side.name, side.quantity)}
                  </span>
                  {sideAmt > 0 ? (
                    <span className="font-mono tabular-nums">
                      +{formatVND(sideAmt)}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        {row.note ? (
          <p className="mt-1 max-h-20 overflow-y-auto break-words pr-1 text-xs font-normal italic text-muted-foreground">
            {SELF_ORDER_VI.itemNoteLabel}: {row.note}
          </p>
        ) : null}
      </div>
    ),
  },
  {
    key: "quantity",
    header: SELF_ORDER_VI.billQuantityColumn,
    className: "w-8 text-right text-xs font-mono tabular-nums",
    render: (row) => row.quantity,
  },
  {
    key: "unit-price",
    header: SELF_ORDER_VI.billUnitPriceColumn,
    className: "whitespace-nowrap text-right text-xs font-mono tabular-nums",
    render: (row) => formatVND(row.unitPrice),
  },
  {
    key: "line-total",
    header: SELF_ORDER_VI.billLineTotalColumn,
    className: "whitespace-nowrap text-right text-xs font-mono tabular-nums",
    render: (row) => (
      <span className="font-semibold text-primary">
        {formatVND(row.lineTotal)}
      </span>
    ),
  },
];

function FlatOrderLines({ items }: { items: SelfOrderOrderLine[] }) {
  const rows = items.map(buildBillRow);

  return (
    <DataTable
      columns={BILL_COLUMNS}
      data={rows}
      getRowKey={(row) => row.key}
      emptyTitle={SELF_ORDER_VI.billEmptyTitle}
      className="text-xs"
      mobileCardRender={(row) => (
        <Item variant="outline" size="sm" className="items-start gap-2">
          <ItemContent className="min-w-0 flex-1 gap-1">
            <div className="flex items-start justify-between gap-2">
              <ItemTitle className="min-w-0 break-words text-sm font-semibold">
                <span className="mr-1.5 font-semibold text-foreground">
                  {row.quantity}x
                </span>
                <span>{row.label}</span>
              </ItemTitle>
              <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-primary">
                {formatVND(row.lineTotal)}
              </span>
            </div>

            {row.modifiers.length > 0 || row.sides.length > 0 ? (
              <div className="mt-1 flex flex-col gap-1 border-l-2 border-border/50 pl-2.5 text-xs text-muted-foreground">
                {row.modifiers.map((modifier) => (
                  <div
                    key={`mod-${modifier.modifier_id}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span>+ {modifier.name}</span>
                    {modifier.price > 0 ? (
                      <span className="font-mono tabular-nums text-2xs">
                        +{formatVND(modifier.price * row.quantity)}
                      </span>
                    ) : null}
                  </div>
                ))}
                {row.sides.map((side) => {
                  const totalSideQty = side.quantity * row.quantity;
                  const sideAmt =
                    side.price > 0 && totalSideQty > 0
                      ? side.price * totalSideQty
                      : 0;
                  return (
                    <div
                      key={`side-${side.side_item_id}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span>
                        + {formatSidePortionLabel(side.name, side.quantity)}
                      </span>
                      {sideAmt > 0 ? (
                        <span className="font-mono tabular-nums text-2xs">
                          +{formatVND(sideAmt)}
                        </span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {row.note ? (
              <p className="mt-1 max-h-20 overflow-y-auto break-words pr-1 text-xs font-normal italic text-muted-foreground">
                {SELF_ORDER_VI.itemNoteLabel}: {row.note}
              </p>
            ) : null}
          </ItemContent>
          {row.quantity > 1 ? (
            <ItemFooter className="justify-end border-t border-border/40 pt-1.5 font-mono text-2xs tabular-nums text-muted-foreground">
              <span>
                {row.quantity} x {formatVND(row.unitPrice)}
              </span>
            </ItemFooter>
          ) : null}
        </Item>
      )}
    />
  );
}

function PendingRequestLines({
  items,
}: {
  items: Array<Omit<SelfOrderCartItem, "key"> & { key?: string }>;
}) {
  return (
    <ItemGroup data-size="xs">
      {items.map((item, index) => {
        const summary = optionSummary(item);
        return (
          <Item key={item.key ?? index} size="xs">
            <ItemContent className="min-w-0">
              <ItemTitle className="break-words text-sm font-normal">
                {item.variant_name
                  ? `${item.item_name} ${item.variant_name}`
                  : item.item_name}
                <span className="ml-1 text-muted-foreground">
                  x{item.quantity}
                </span>
              </ItemTitle>
              {summary ? (
                <ItemDescription className="break-words text-xs">
                  {summary}
                </ItemDescription>
              ) : null}
            </ItemContent>
          </Item>
        );
      })}
    </ItemGroup>
  );
}

export function OrderStatusTracker({
  hasPending,
  hasConfirmedItems,
}: {
  hasPending: boolean;
  hasConfirmedItems: boolean;
}) {
  const steps = [
    {
      label: SELF_ORDER_VI.stepSent,
      done: true,
      active: hasPending,
    },
    {
      label: SELF_ORDER_VI.stepCooking,
      done: hasConfirmedItems && !hasPending,
      active: hasConfirmedItems && !hasPending,
    },
    {
      label: SELF_ORDER_VI.stepServing,
      done: false,
      active: false,
    },
  ];

  return (
    <Frame
      className="flex items-center justify-between bg-muted/30 p-2.5 text-xs"
      aria-label={SELF_ORDER_VI.orderProgressAria}
    >
      <div className="flex w-full items-center justify-between">
        {steps.map((step, idx) => (
          <div key={step.label} className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-3xs font-semibold tabular-nums",
                step.done
                  ? "bg-primary text-primary-foreground"
                  : step.active
                    ? "bg-primary/15 text-primary ring-1 ring-primary/20"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {step.done ? <IconCheck className="size-3" /> : idx + 1}
            </span>
            <span
              className={cn(
                "font-medium",
                step.done || step.active
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
            {idx < steps.length - 1 ? (
              <span
                className="mx-1 h-px w-3 bg-border/80 sm:mx-2 sm:w-6"
                aria-hidden
              />
            ) : null}
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function OrderSummary({
  pendingItems = [],
  items = [],
}: OrderSummaryProps) {
  if (pendingItems.length === 0 && items.length === 0) {
    return (
      <AppEmptyState
        title={SELF_ORDER_VI.billEmptyTitle}
        description={SELF_ORDER_VI.billEmptyDescription}
        symbol="riceBowl"
        compact
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <OrderStatusTracker
        hasPending={pendingItems.length > 0}
        hasConfirmedItems={items.length > 0}
      />

      {pendingItems.length > 0 ? (
        <Item variant="outline" className="relative overflow-hidden">
          <div className="pointer-events-none flex flex-col gap-2 p-2 opacity-50 blur-[2px] select-none">
            <SectionLabel density="dense">
              <IconClock className="size-3.5" aria-hidden />
              {SELF_ORDER_VI.awaitingCalloutTitle}
            </SectionLabel>
            <PendingRequestLines items={pendingItems} />
          </div>
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/75 px-4 text-center backdrop-blur-sm"
            role="status"
          >
            <BrandMascot decorative size="sm" />
            <p className="text-sm font-medium">
              {SELF_ORDER_VI.awaitingCalloutTitle}
            </p>
            <p className="text-xs text-muted-foreground">
              {SELF_ORDER_VI.awaitingCalloutDescription}
            </p>
          </div>
        </Item>
      ) : null}

      {items.length > 0 ? (
        <FlatOrderLines items={items} />
      ) : null}
    </div>
  );
}
