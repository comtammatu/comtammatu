"use client";

import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  deriveVariance,
  type EditableLine,
  type GRNDetailItem,
} from "../views/grn-detail-types";

interface UseGrnLinesReturn {
  lines: EditableLine[];
  setLines: Dispatch<SetStateAction<EditableLine[]>>;
  patch: (idx: number, p: Partial<EditableLine>) => void;
  stats: {
    acceptedLines: number;
    rejectedLines: number;
    reviewLines: number;
    total: number;
  };
  dirtyLines: EditableLine[];
}

/**
 * Optimistic in-memory line store for the GRN detail view. Seeded from the
 * server-rendered items; `patch` flips a row dirty so the footer can gate
 * save/confirm. `reviewPct` is `qc.priceVarianceReviewPct` — passed in so the
 * stats memo only re-runs when that threshold changes (matching the original
 * dependency list).
 */
export function useGrnLines(
  initialItems: GRNDetailItem[],
  reviewPct: number,
): UseGrnLinesReturn {
  const [lines, setLines] = useState<EditableLine[]>(() =>
    initialItems.map((it) => ({ ...it, dirty: false })),
  );

  const stats = useMemo(() => {
    const acceptedLines = lines.filter(
      (l) => l.qualityStatus !== "rejected" && l.actual - l.rejected > 0,
    ).length;
    const rejectedLines = lines.filter(
      (l) => l.qualityStatus === "rejected" || l.rejected > 0,
    ).length;
    const reviewLines = lines.filter((l) => {
      const variance = deriveVariance(l.cost, l.poUnitPrice);
      return (
        l.requiresReview ||
        (variance != null && Math.abs(variance) > reviewPct)
      );
    }).length;
    // Total received value = cost × (delivered − rejected)
    const total = lines.reduce(
      (sum, l) => sum + l.cost * (l.actual - l.rejected),
      0,
    );
    return { acceptedLines, rejectedLines, reviewLines, total };
  }, [lines, reviewPct]);

  const dirtyLines = lines.filter((l) => l.dirty);

  function patch(idx: number, p: Partial<EditableLine>) {
    setLines((prev) => {
      const next = prev.slice();
      const cur = next[idx];
      if (!cur) return prev;
      next[idx] = { ...cur, ...p, dirty: true };
      return next;
    });
  }

  return { lines, setLines, patch, stats, dirtyLines };
}
