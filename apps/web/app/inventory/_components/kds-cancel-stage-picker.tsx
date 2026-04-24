"use client";

import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Label } from "@comtammatu/ui/components/label";
import { Slider } from "@comtammatu/ui/components/slider";
import {
  IconFlame,
  IconFlameOff,
  IconChefHat,
} from "@tabler/icons-react";

export type KdsCancelStage =
  | "before_cook"
  | "mid_cook"
  | "after_cook";

export type KdsCancelDecision = {
  /** Internal KDS stage the chef picked. */
  stage: KdsCancelStage;
  /**
   * For `mid_cook` only — how much of the recipe was already consumed.
   * 0–100 integer. Undefined for other stages.
   */
  ratio?: number;
  /**
   * Maps to `create_waste_from_order.p_source_type`. `null` for
   * `before_cook` (nothing consumed → no waste row, non-null stages
   * always map 1-1).
   */
  wasteSourceType: "kds_cancel_mid_cook" | "kds_cancel_after_cook" | null;
};

interface KdsCancelStagePickerProps {
  value: KdsCancelStage;
  onChange: (decision: KdsCancelDecision) => void;
  ratio?: number;
  /** Disable all inputs (e.g. submitting). */
  disabled?: boolean;
  className?: string;
}

interface StageMeta {
  key: KdsCancelStage;
  label: string;
  description: string;
  /** Whether to produce a waste row. */
  producesWaste: boolean;
}

const STAGE_META: Record<KdsCancelStage, StageMeta> = {
  before_cook: {
    key: "before_cook",
    label: "Trước khi nấu",
    description:
      "Chưa động vào nguyên liệu. Cancel không sinh phiếu waste.",
    producesWaste: false,
  },
  mid_cook: {
    key: "mid_cook",
    label: "Đang nấu",
    description: "Một phần nguyên liệu đã dùng. Chọn % đã hao để tạo waste.",
    producesWaste: true,
  },
  after_cook: {
    key: "after_cook",
    label: "Sau khi nấu xong",
    description:
      "Đã hoàn thành món — hủy ở stage này = waste 100% recipe.",
    producesWaste: true,
  },
};

const ORDER: KdsCancelStage[] = ["before_cook", "mid_cook", "after_cook"];

/**
 * Chef-facing KDS cancel stage picker (S11-ext).
 *
 * Decides whether a KDS cancel produces a waste row and — for `mid_cook` —
 * what ratio of the recipe to write off. Emits a normalized
 * `KdsCancelDecision` that the host can feed directly into
 * `createWasteFromOrder` after expanding the recipe with the ratio.
 *
 * UX contract:
 *   - `before_cook` → `wasteSourceType=null` (no RPC call)
 *   - `mid_cook`    → ratio slider 0-100%, default 50, clamped
 *   - `after_cook`  → 100% of recipe (ratio omitted)
 */
export function KdsCancelStagePicker({
  value,
  onChange,
  ratio = 50,
  disabled,
  className,
}: KdsCancelStagePickerProps) {
  function pickStage(stage: KdsCancelStage) {
    const meta = STAGE_META[stage];
    onChange({
      stage,
      ratio: stage === "mid_cook" ? clampRatio(ratio) : undefined,
      wasteSourceType: meta.producesWaste
        ? (`kds_cancel_${stage}` as "kds_cancel_mid_cook" | "kds_cancel_after_cook")
        : null,
    });
  }

  function updateRatio(next: number) {
    onChange({
      stage: "mid_cook",
      ratio: clampRatio(next),
      wasteSourceType: "kds_cancel_mid_cook",
    });
  }

  return (
    <div
      className={cn("space-y-3", className)}
      data-slot="kds-cancel-stage-picker"
      data-stage={value}
    >
      <div
        role="radiogroup"
        aria-label="Stage khi hủy"
        className="grid gap-2 sm:grid-cols-3"
      >
        {ORDER.map((stage) => {
          const meta = STAGE_META[stage];
          const checked = value === stage;
          return (
            <label
              key={stage}
              data-checked={checked ? "true" : "false"}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-md border p-3 text-sm transition",
                checked
                  ? "border-primary bg-primary/5"
                  : "border-muted hover:border-primary/50",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="kds-cancel-stage"
                  value={stage}
                  checked={checked}
                  disabled={disabled}
                  onChange={() => pickStage(stage)}
                  className="size-4 accent-primary"
                />
                <span className="font-medium">{meta.label}</span>
                <span className="ml-auto">
                  {stage === "before_cook" ? (
                    <IconFlameOff className="size-4 text-muted-foreground" />
                  ) : stage === "after_cook" ? (
                    <IconChefHat className="size-4 text-orange-600" />
                  ) : (
                    <IconFlame className="size-4 text-amber-600" />
                  )}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{meta.description}</p>
              <div className="flex items-center gap-1 pt-1">
                {meta.producesWaste ? (
                  <Badge
                    variant="outline"
                    className="border-red-300 bg-red-50 text-red-900 text-[10px]"
                  >
                    Sinh waste
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-slate-300 text-slate-700 text-[10px]"
                  >
                    Không sinh waste
                  </Badge>
                )}
              </div>
            </label>
          );
        })}
      </div>

      {value === "mid_cook" ? (
        <div
          className="space-y-2 rounded-md border border-amber-200 bg-amber-50/60 p-3"
          data-slot="kds-cancel-stage-picker-ratio"
        >
          <div className="flex items-center justify-between">
            <Label className="text-sm">
              Tỉ lệ nguyên liệu đã dùng
            </Label>
            <span className="font-semibold tabular-nums text-amber-900">
              {clampRatio(ratio)}%
            </span>
          </div>
          <Slider
            value={[clampRatio(ratio)]}
            min={0}
            max={100}
            step={5}
            disabled={disabled}
            onValueChange={(arr) => {
              const v = arr[0];
              if (typeof v === "number") updateRatio(v);
            }}
          />
          <p className="text-xs text-amber-800">
            Waste sẽ = công thức × {clampRatio(ratio)}%. Bước 5% để tránh chia
            nhỏ cố ý vượt trần ca.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function clampRatio(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Helper to build the final `items[]` payload for `createWasteFromOrder`.
 * Applies `ratio/100` to each pre-expanded recipe quantity. Callers
 * pass the recipe output already expanded to ingredient rows.
 */
export function applyCancelRatioToItems<
  T extends { quantity: number },
>(items: T[], decision: KdsCancelDecision): T[] {
  if (decision.wasteSourceType === null) return [];
  const factor =
    decision.stage === "mid_cook" && typeof decision.ratio === "number"
      ? decision.ratio / 100
      : 1;
  if (factor === 0) return [];
  return items
    .map((it) => ({ ...it, quantity: it.quantity * factor }))
    .filter((it) => it.quantity > 0);
}
