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
    total: number;
  };
  dirtyLines: EditableGrnLine[];
}

export function useGrnDetailLines(
  initialItems: GrnDetailItem[],
  reviewPct: number,
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
      const variance = deriveGrnVariance(line.cost, line.poUnitPrice);
      return (
        line.requiresReview ||
        isGrnBaselineReviewRequired(line.baselineVariancePct) ||
        (variance != null && Math.abs(variance) > reviewPct)
      );
    }).length;
    const total = lines.reduce(
      (sum, line) => sum + line.cost * (line.actual - line.rejected),
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
