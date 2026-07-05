"use client";

import * as React from "react";
import { Delete as IconBackspace } from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { cn } from "@comtammatu/ui";

export const NUMPAD_KEYS = [
  "7",
  "8",
  "9",
  "4",
  "5",
  "6",
  "1",
  "2",
  "3",
  ".",
  "0",
  "del",
] as const;

export type NumpadKey = (typeof NUMPAD_KEYS)[number];

export function appendNumpadKey(
  current: string,
  key: NumpadKey,
  allowDecimal: boolean,
): string {
  if (key === "del") {
    return current.slice(0, -1);
  }
  if (key === ".") {
    if (!allowDecimal) return current;
    if (current.includes(".")) return current;
    return current.length === 0 ? "0." : `${current}.`;
  }
  if (current === "0") {
    return key;
  }
  return `${current}${key}`;
}

type NumberPadGridProps = {
  onKey: (key: NumpadKey) => void;
  allowDecimal?: boolean;
  className?: string;
};

export function NumberPadGrid({
  onKey,
  allowDecimal = true,
  className,
}: NumberPadGridProps) {
  return (
    <div className={cn("grid grid-cols-3 gap-2", className)}>
      {NUMPAD_KEYS.map((key) => (
        <Button
          key={key}
          type="button"
          variant="secondary"
          size="touch-lg"
          onClick={() => onKey(key)}
          className={cn(
            "bg-muted text-2xl font-semibold tabular-nums",
            "transition-transform active:scale-95 active:bg-muted-foreground/20",
            key === "del" && "text-destructive",
            key === "." && !allowDecimal && "pointer-events-none opacity-30",
          )}
          aria-label={key === "del" ? ACTIONS_VI.delete : key}
        >
          {key === "del" ? <IconBackspace className="size-6" /> : key}
        </Button>
      ))}
    </div>
  );
}
