"use client";

import { Frame } from "@comtammatu/ui/components/frame";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { messages } from "@lib/messages";
import type { OrderType } from "../types";

export function PosServiceModeSelector({
  cartOrderType,
  cartItemCount,
  onOrderTypeChange,
}: {
  cartOrderType: OrderType;
  cartItemCount: number;
  onOrderTypeChange: (type: OrderType) => void;
}) {
  return (
    <Frame className="bg-muted/50 p-1">
      <ToggleGroup
        type="single"
        value={cartOrderType}
        variant="outline"
        size="touch"
        spacing={0}
        className="grid w-full grid-cols-3"
        aria-label={messages.pos.desktop.serviceModeAria}
        onValueChange={(value) => {
          if (
            value === "dine_in" ||
            value === "takeaway" ||
            value === "delivery"
          ) {
            onOrderTypeChange(value);
          }
        }}
      >
        <ToggleGroupItem
          value="dine_in"
          className="w-full min-w-0 justify-center text-sm font-semibold"
          disabled={cartItemCount > 0 && cartOrderType !== "dine_in"}
        >
          {messages.pos.desktop.dineIn}
        </ToggleGroupItem>
        <ToggleGroupItem
          value="takeaway"
          className="w-full min-w-0 justify-center text-sm font-semibold"
          disabled={cartItemCount > 0 && cartOrderType !== "takeaway"}
        >
          {messages.pos.desktop.takeaway}
        </ToggleGroupItem>
        <ToggleGroupItem
          value="delivery"
          className="w-full min-w-0 justify-center text-sm font-semibold"
          disabled={cartItemCount > 0 && cartOrderType !== "delivery"}
        >
          {messages.pos.desktop.delivery}
        </ToggleGroupItem>
      </ToggleGroup>
    </Frame>
  );
}
