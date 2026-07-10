"use client";

import { useCallback } from "react";
import { Button } from "@comtammatu/ui/components/button";
import { cn } from "@comtammatu/ui";

interface QuickReasonChipsProps {
  presets: readonly string[];
  value: string;
  onChange: (next: string) => void;
  className?: string;
  ariaLabel?: string;
}

/**
 * Tap a chip to toggle a preset phrase in/out of the textarea value.
 * Tokens are split by comma so manual free-text the cashier types alongside
 * still survives toggling — only exact-match comma segments are added/removed.
 */
export function QuickReasonChips({
  presets,
  value,
  onChange,
  className,
  ariaLabel,
}: QuickReasonChipsProps) {
  const tokens = splitTokens(value);
  const tokenSet = new Set(tokens.map((t) => t.toLowerCase()));

  const toggle = useCallback(
    (preset: string) => {
      const current = splitTokens(value);
      const lower = preset.toLowerCase();
      const idx = current.findIndex((t) => t.toLowerCase() === lower);
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        current.push(preset);
      }
      onChange(current.join(", "));
    },
    [onChange, value],
  );

  return (
    <div
      role="group"
      aria-label={ariaLabel ?? "Gợi ý nhanh"}
      className={cn("flex flex-wrap gap-1.5", className)}
    >
      {presets.map((preset) => {
        const isActive = tokenSet.has(preset.toLowerCase());
        return (
          <Button
            key={preset}
            type="button"
            size="touch"
            variant={isActive ? "default" : "outline"}
            aria-pressed={isActive}
            className="rounded-full px-3 text-xs font-normal"
            onClick={() => toggle(preset)}
          >
            {preset}
          </Button>
        );
      })}
    </div>
  );
}

function splitTokens(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
