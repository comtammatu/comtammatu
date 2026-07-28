"use client";

import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  deriveGrnVariance,
  type EditableGrnLine,
  type GrnDetailItem,
} from "./grn-detail-model";
import { isGrnBaselineReviewRequired } from "./grn-quality";

interface UseGrnDetailLinesReturn {
  lines: EditableGrnLine[];
  setLines: Dispatch<SetStateAction<EditableGrnLine[]>>;
  patch: (idx: number, patch: Partial<EditableGrnLine>) => void;
  stats: {
    acceptedLines: number;
    rejectedLines: number;
    reviewLines: number;
    total: number | null;
  };
  dirtyLines: EditableGrnLine[];
}

export function useGrnDetailLines(
  initialItems: GrnDetailItem[],
  reviewPct: number | null,
): UseGrnDetailLinesReturn {
  const [lines, setLines] = useState<EditableGrnLine[]>(() =>
    initialItems.map((item) => ({ ...item, dirty: false })),
  );

  const stats = useMemo(() => {
    const acceptedLines = lines.filter(
      (line) =>
        line.qualityStatus !== "rejected" && line.actual - line.rejected > 0,
    ).length;
    const rejectedLines = lines.filter(
      (line) => line.qualityStatus === "rejected" || line.rejected > 0,
    ).length;
    const reviewLines = lines.filter((line) => {
      const variance = line.monetary
        ? deriveGrnVariance(
            line.monetary.unitCost,
            line.monetary.poUnitPrice,
          )
        : null;
      return (
        line.requiresReview ||
        isGrnBaselineReviewRequired(
          line.monetary?.baselineVariancePct ?? null,
        ) ||
        (reviewPct != null &&
          variance != null &&
          Math.abs(variance) > reviewPct)
      );
    }).length;
    const total = lines.some((line) => line.monetary == null)
      ? null
      : lines.reduce(
          (sum, line) =>
            sum +
            (line.monetary?.unitCost ?? 0) *
              (line.actual - line.rejected),
          0,
        );
    return { acceptedLines, rejectedLines, reviewLines, total };
  }, [lines, reviewPct]);

  const dirtyLines = lines.filter((line) => line.dirty);

  function patch(idx: number, patchValue: Partial<EditableGrnLine>) {
    setLines((previous) => {
      const next = previous.slice();
      const current = next[idx];
      if (!current) return previous;
      next[idx] = { ...current, ...patchValue, dirty: true };
      return next;
    });
  }

  return { lines, setLines, patch, stats, dirtyLines };
}
