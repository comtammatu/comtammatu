"use client";

import { Clock as IconClock } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
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

interface BillRow {
  key: string;
  label: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  option: boolean;
  note: string | null;
}

export function buildBillRows(item: SelfOrderOrderLine): BillRow[] {
  const optionRows: BillRow[] = [
    ...item.modifiers.map((modifier) => ({
      key: `item-${String(item.id)}-modifier-${String(modifier.modifier_id)}`,
      label: modifier.name,
      quantity: item.quantity,
      unitPrice: modifier.price,
      lineTotal: modifier.price * item.quantity,
      option: true,
      note: null,
    })),
    ...item.sides.map((side) => {
      const quantity = side.quantity * item.quantity;
      return {
        key: `item-${String(item.id)}-side-${String(side.side_item_id)}`,
        label: side.name,
        quantity,
        unitPrice: side.price,
        lineTotal: side.price * quantity,
        option: true,
        note: null,
      };
    }),
  ];
  const optionTotal = optionRows.reduce((sum, row) => sum + row.lineTotal, 0);
  const lineTotal = Math.max(0, item.lineTotal - optionTotal);

  return [
    {
      key: `item-${String(item.id)}`,
      label: item.variantName
        ? `${item.itemName} ${item.variantName}`
        : item.itemName,
      quantity: item.quantity,
      unitPrice: lineTotal / item.quantity,
      lineTotal,
      option: false,
      note: item.note,
    },
    ...optionRows,
  ];
}

function optionSummary(item: {
  modifiers: { name: string }[];
  sides: { name: string; quantity: number }[];
  note?: string | null;
}) {
  return [
    ...item.modifiers.map((modifier) => modifier.name),
    ...item.sides.map((side) =>
      side.quantity > 1 ? `${side.quantity}x ${side.name}` : side.name,
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
      <div
        className={`min-w-0 break-words leading-snug ${row.option ? "pl-3 text-muted-foreground" : "font-medium"}`}
      >
        {row.option ? "+ " : ""}
        {row.label}
        {!row.option && row.note ? (
          <p className="max-h-20 overflow-y-auto break-words pr-1 text-xs font-normal text-muted-foreground">
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
      <span
        className={row.option ? "text-muted-foreground" : "text-primary"}
      >
        {formatVND(row.lineTotal)}
      </span>
    ),
  },
];

function FlatOrderLines({ items }: { items: SelfOrderOrderLine[] }) {
  const rows = items.flatMap(buildBillRows);

  return (
    <DataTable
      columns={BILL_COLUMNS}
      data={rows}
      getRowKey={(row) => row.key}
      emptyTitle={SELF_ORDER_VI.billEmptyTitle}
      className="text-xs"
      mobileCardRender={(row) => (
        <Item variant="outline" size="xs">
          <ItemContent>
            <ItemTitle className="break-words">
              {row.option ? "+ " : ""}
              {row.label}
            </ItemTitle>
            {!row.option && row.note ? (
              <ItemDescription className="break-words">
                {SELF_ORDER_VI.itemNoteLabel}: {row.note}
              </ItemDescription>
            ) : null}
          </ItemContent>
          <ItemFooter className="font-mono tabular-nums">
            <span className="text-muted-foreground">
              {row.quantity} x {formatVND(row.unitPrice)}
            </span>
            <span className={row.option ? "text-muted-foreground" : "text-primary"}>
              {formatVND(row.lineTotal)}
            </span>
          </ItemFooter>
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
    <div className="flex flex-col gap-4">
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
