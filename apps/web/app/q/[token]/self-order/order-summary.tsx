"use client";

import { formatVND } from "@comtammatu/shared/format";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemHeader,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { AppEmptyState, AppSection } from "@/components/surface";
import type {
  SelfOrderGuestBatch,
  SelfOrderGuestBatchItem,
  SelfOrderGuestBatchStatus,
  SelfOrderOrderLine,
} from "@lib/self-order/contracts";

interface OrderSummaryProps {
  batches?: SelfOrderGuestBatch[] | null;
  items?: SelfOrderOrderLine[];
  totalAmount?: number | null;
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

function batchItemLineTotal(item: SelfOrderGuestBatchItem) {
  const modifierTotal = item.modifiers.reduce(
    (sum, modifier) => sum + Number(modifier.price ?? 0),
    0,
  );
  const sideTotal = item.sides.reduce(
    (sum, side) => sum + Number(side.price ?? 0) * Number(side.quantity ?? 1),
    0,
  );
  return (Number(item.unitPrice) + modifierTotal + sideTotal) * item.quantity;
}

function roundStatusBadge(status: SelfOrderGuestBatchStatus): {
  label: string;
  variant: "warning" | "success" | "destructive" | "secondary";
} {
  if (status === "pending_approval") {
    return { label: SELF_ORDER_VI.roundStatusPending, variant: "warning" };
  }
  if (status === "approved") {
    return { label: SELF_ORDER_VI.roundStatusApproved, variant: "success" };
  }
  return { label: SELF_ORDER_VI.roundStatusRejected, variant: "destructive" };
}

function BatchRound({ batch }: { batch: SelfOrderGuestBatch }) {
  const status = roundStatusBadge(batch.status);
  const muted = batch.status === "rejected";

  return (
    <Item variant="outline" size="sm" className="flex-col items-stretch gap-2">
      <ItemHeader>
        <SectionLabel density="dense">
          {SELF_ORDER_VI.roundLabel(batch.roundIndex)}
        </SectionLabel>
        <Badge variant={status.variant}>{status.label}</Badge>
      </ItemHeader>
      <ItemGroup data-size="xs" className={muted ? "opacity-60" : undefined}>
        {batch.items.map((item, index) => {
          const summary = optionSummary(item);
          const lineTotal = batchItemLineTotal(item);
          return (
            <Item key={`${batch.id}:${item.menuItemId}:${index}`} size="xs">
              <ItemContent className="min-w-0">
                <ItemTitle
                  className={`break-words text-sm font-normal ${muted ? "line-through" : ""}`}
                >
                  {item.variantName
                    ? `${item.itemName} ${item.variantName}`
                    : item.itemName}
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
              <ItemDescription
                className={`shrink-0 font-mono tabular-nums ${muted ? "line-through" : ""}`}
              >
                {formatVND(lineTotal)}
              </ItemDescription>
            </Item>
          );
        })}
      </ItemGroup>
      {batch.customerNote ? (
        <p className="text-xs text-muted-foreground">
          {SELF_ORDER_VI.noteLabel}: {batch.customerNote}
        </p>
      ) : null}
    </Item>
  );
}

function FlatOrderLines({ items }: { items: SelfOrderOrderLine[] }) {
  return (
    <ItemGroup data-size="xs">
      {items.map((item, index) => {
        const summary = optionSummary(item);
        return (
          <Item key={`${item.menuItemId}:${index}`} size="xs">
            <ItemContent className="min-w-0">
              <ItemTitle className="break-words text-sm font-normal">
                {item.variantName
                  ? `${item.itemName} ${item.variantName}`
                  : item.itemName}
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
            <ItemDescription className="shrink-0 font-mono tabular-nums">
              {formatVND(item.lineTotal)}
            </ItemDescription>
          </Item>
        );
      })}
    </ItemGroup>
  );
}

export function OrderSummary({
  batches,
  items = [],
  totalAmount,
}: OrderSummaryProps) {
  const rounds = batches ?? [];
  if (items.length === 0 && rounds.length === 0) {
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
      {items.length > 0 ? (
        <AppSection
          title={SELF_ORDER_VI.orderedItemsTitle}
          description={SELF_ORDER_VI.orderedItemsDescription}
          badge={{ children: items.length, variant: "outline" }}
          size="sm"
          contentClassName="gap-2"
        >
          <>
            <FlatOrderLines items={items} />
            {totalAmount != null ? (
              <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm font-bold">
                <span>{SELF_ORDER_VI.total}</span>
                <span className="font-mono tabular-nums">
                  {formatVND(totalAmount)}
                </span>
              </div>
            ) : null}
          </>
        </AppSection>
      ) : null}

      {rounds.length > 0 ? (
        <AppSection
          title={SELF_ORDER_VI.roundsTitle}
          description={SELF_ORDER_VI.roundsDescription}
          badge={{ children: rounds.length, variant: "outline" }}
          size="sm"
          contentClassName="gap-3"
        >
          <>
            {rounds.map((batch) => (
              <BatchRound key={batch.id} batch={batch} />
            ))}
          </>
        </AppSection>
      ) : null}
    </div>
  );
}
