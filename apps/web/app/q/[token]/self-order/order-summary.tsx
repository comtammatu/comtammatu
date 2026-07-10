"use client";

import { Clock as IconClock } from "lucide-react";
import { formatVND } from "@comtammatu/shared/format";
import { SELF_ORDER_VI } from "@comtammatu/shared/messages";
import { Badge } from "@comtammatu/ui/components/badge";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import { SectionLabel } from "@comtammatu/ui/components/section-label";
import { AppEmptyState, AppSection } from "@/components/surface";
import type {
  SelfOrderCartItem,
  SelfOrderOrderLine,
  SelfOrderRound,
  SelfOrderRoundItem,
} from "@lib/self-order/contracts";

interface OrderSummaryProps {
  pendingItems?: Array<Omit<SelfOrderCartItem, "key"> & { key?: string }>;
  rounds?: SelfOrderRound[] | null;
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

function RoundItem({ item }: { item: SelfOrderRoundItem }) {
  const summary = optionSummary(item);
  return (
    <Item size="xs">
      <ItemContent className="min-w-0">
        <ItemTitle className="break-words text-sm font-normal">
          {item.variantName
            ? `${item.itemName} ${item.variantName}`
            : item.itemName}
          <span className="ml-1 text-muted-foreground">x{item.quantity}</span>
        </ItemTitle>
        {summary ? (
          <ItemDescription className="break-words text-xs">
            {summary}
          </ItemDescription>
        ) : null}
      </ItemContent>
    </Item>
  );
}

function FlatOrderLines({ items }: { items: SelfOrderOrderLine[] }) {
  return (
    <ItemGroup data-size="xs">
      {items.map((item) => {
        const summary = optionSummary(item);
        return (
          <Item key={item.id} size="xs">
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
  rounds,
  items = [],
  totalAmount,
}: OrderSummaryProps) {
  const visibleRounds = rounds ?? [];
  if (
    pendingItems.length === 0 &&
    items.length === 0 &&
    visibleRounds.length === 0
  ) {
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
      {pendingItems.length > 0 ? (
        <AppSection
          title={SELF_ORDER_VI.awaitingCalloutTitle}
          description={SELF_ORDER_VI.awaitingCalloutDescription}
          badge={{
            children: <IconClock className="size-3.5" aria-hidden />,
            variant: "warning",
          }}
          size="sm"
        >
          <PendingRequestLines items={pendingItems} />
        </AppSection>
      ) : null}

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

      {visibleRounds.length > 0 ? (
        <AppSection
          title={SELF_ORDER_VI.roundsTitle}
          description={SELF_ORDER_VI.roundsDescription}
          badge={{ children: visibleRounds.length, variant: "outline" }}
          size="sm"
          contentClassName="gap-3"
        >
          <>
            {visibleRounds.map((round) => (
              <Item
                key={round.id}
                variant="outline"
                size="sm"
                className="flex-col items-stretch gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <SectionLabel density="dense">
                    {SELF_ORDER_VI.roundLabel(round.sendSeq)}
                  </SectionLabel>
                  <Badge variant="outline">{round.ticketNumber}</Badge>
                </div>
                <ItemGroup data-size="xs">
                  {round.items.map((item) => (
                    <RoundItem key={item.id} item={item} />
                  ))}
                </ItemGroup>
              </Item>
            ))}
          </>
        </AppSection>
      ) : null}
    </div>
  );
}
