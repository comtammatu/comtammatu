"use client";

import { Minus as IconMinus, Plus as IconPlus } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";

export function QuantityStepper({
  quantity,
  disabled = false,
  decreaseLabel,
  increaseLabel,
  onDecrease,
  onIncrease,
}: {
  quantity: number;
  disabled?: boolean;
  decreaseLabel: string;
  increaseLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-1"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Button
        type="button"
        variant="outline"
        size="icon-touch"
        className="size-8"
        disabled={disabled || quantity <= 0}
        aria-label={decreaseLabel}
        onClick={onDecrease}
      >
        <IconMinus className="size-4" />
      </Button>
      <span className="min-w-6 text-center text-sm font-semibold tabular-nums">
        {quantity}
      </span>
      <Button
        type="button"
        size="icon-touch"
        className="size-8"
        disabled={disabled}
        aria-label={increaseLabel}
        onClick={onIncrease}
      >
        <IconPlus className="size-4" />
      </Button>
    </div>
  );
}
