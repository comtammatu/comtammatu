"use client";

import { STOCKTAKE_MODE_LABELS_VI } from "@comtammatu/shared/labels";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";

export type StocktakeMode = "daily" | "weekly" | "monthly" | "quarterly" | "spot";

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
    description:
      "Quick count cuối ca. Không có reviewer — variance được ghi log nhưng không block.",
  },
  weekly: {
    key: "weekly",
    defaultBlind: false,
    unaudited: false,
    description:
      "Đếm theo nhóm ABC — A mỗi tuần, B/C xoay vòng. Reviewer + QLV duyệt.",
  },
  monthly: {
    key: "monthly",
    defaultBlind: true,
    unaudited: false,
    description:
      "Full inventory, blind mode. Không hiển thị tồn hệ thống — counter nhập mù.",
  },
  quarterly: {
    key: "quarterly",
    defaultBlind: true,
    unaudited: false,
    description:
      "Peer-cross: nhân sự CN khác đếm. Blind + double-check mọi nhóm.",
  },
  spot: {
    key: "spot",
    defaultBlind: true,
    unaudited: false,
    description:
      "QLV đột xuất. Có thể chỉ vài SKU. Blind default nhưng QLV override.",
  },
};

const ORDER: StocktakeMode[] = ["daily", "weekly", "monthly", "quarterly", "spot"];

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
      aria-label="Chọn chế độ kiểm kê"
      data-slot="stocktake-mode-selector"
      className={cn("grid gap-2 sm:grid-cols-2", className)}
    >
      {ORDER.map((m) => {
        const meta = MODE_META[m];
        const label = STOCKTAKE_MODE_LABELS_VI[m];
        const checked = value === m;
        return (
          <label
            key={m}
            data-checked={checked ? "true" : "false"}
            className={cn(
              "flex cursor-pointer flex-col gap-1.5 rounded-md border p-3 text-sm transition",
              checked
                ? "border-primary bg-primary/5"
                : "border-muted hover:border-primary/50",
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
                  <Badge
                    variant="outline"
                    className="border-amber-300 bg-amber-50 text-amber-900 text-[10px]"
                  >
                    Blind
                  </Badge>
                ) : null}
                {meta.unaudited ? (
                  <Badge
                    variant="outline"
                    className="border-slate-300 bg-slate-50 text-slate-800 text-[10px]"
                  >
                    Unaudited
                  </Badge>
                ) : null}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{meta.description}</p>
          </label>
        );
      })}
    </div>
  );
}

export function getModeMeta(mode: StocktakeMode): ModeMeta {
  return MODE_META[mode];
}
