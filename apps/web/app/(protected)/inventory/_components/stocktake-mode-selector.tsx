"use client";

import { STOCKTAKE_MODE_LABELS_VI } from "@comtammatu/shared/labels";
import { INVENTORY_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Item } from "@comtammatu/ui/components/item";
import { messages } from "@lib/messages";

const stocktakeCopy = messages.inventory.stocktake;

export type StocktakeMode =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "spot";

interface StocktakeModeSelectorProps {
  value: StocktakeMode;
  onChange: (mode: StocktakeMode) => void;
  /** Disable radio inputs (e.g. after session already started). */
  disabled?: boolean;
  className?: string;
}

interface ModeMeta {
  key: StocktakeMode;
  /** Default blind per spec §Q2 */
  defaultBlind: boolean;
  /** Whether this mode is `unaudited` (daily) with looser finality */
  unaudited: boolean;
  description: string;
}

const MODE_META: Record<StocktakeMode, ModeMeta> = {
  daily: {
    key: "daily",
    defaultBlind: false,
    unaudited: true,
    description: INVENTORY_VI.stocktakeModeQuickDesc,
  },
  weekly: {
    key: "weekly",
    defaultBlind: false,
    unaudited: false,
    description: INVENTORY_VI.stocktakeModeCycleDesc,
  },
  monthly: {
    key: "monthly",
    defaultBlind: true,
    unaudited: false,
    description: INVENTORY_VI.stocktakeModeFullDesc,
  },
  quarterly: {
    key: "quarterly",
    defaultBlind: true,
    unaudited: false,
    description: INVENTORY_VI.stocktakeModePeerDesc,
  },
  spot: {
    key: "spot",
    defaultBlind: true,
    unaudited: false,
    description: INVENTORY_VI.stocktakeModeSpotDesc,
  },
};

const ORDER: StocktakeMode[] = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "spot",
];

/**
 * Radio-card selector for stocktake session mode (S13a).
 * Shows per-mode description + blind/unaudited badges so the QLV understands
 * the defaults before pressing "Bắt đầu".
 */
export function StocktakeModeSelector({
  value,
  onChange,
  disabled,
  className,
}: StocktakeModeSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label={INVENTORY_VI.selectStocktakeMode}
      data-slot="stocktake-mode-selector"
      className={cn("grid gap-2 sm:grid-cols-2", className)}
    >
      {ORDER.map((m) => {
        const meta = MODE_META[m];
        const label = STOCKTAKE_MODE_LABELS_VI[m];
        const checked = value === m;
        return (
          <Item
            key={m}
            render={<label data-checked={checked ? "true" : "false"} />}
            variant="outline"
            className={cn(
              "cursor-pointer flex-col items-stretch gap-1.5 text-sm",
              checked
                ? "border-primary bg-primary/10"
                : "hover:border-primary/20",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name="stocktake-mode"
                value={m}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(m)}
                className="size-4 accent-primary"
              />
              <span className="font-medium">{label}</span>
              <div className="ml-auto flex items-center gap-1">
                {meta.defaultBlind ? (
                  <Badge variant="warning">{stocktakeCopy.blindMode}</Badge>
                ) : null}
                {meta.unaudited ? (
                  <Badge variant="secondary">{stocktakeCopy.quickMode}</Badge>
                ) : null}
              </div>
            </div>
            <p className="line-clamp-2 break-words text-xs text-muted-foreground">
              {meta.description}
            </p>
          </Item>
        );
      })}
    </div>
  );
}

export function getModeMeta(mode: StocktakeMode): ModeMeta {
  return MODE_META[mode];
}
