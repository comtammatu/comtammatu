"use client";

import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { EditableGrnLine, GrnDetailItem } from "./grn-detail-model";
import { applyGrnLineQuantities } from "./grn-detail-model";

interface UseGrnDetailLinesReturn {
  lines: EditableGrnLine[];
  setLines: Dispatch<SetStateAction<EditableGrnLine[]>>;
  patch: (idx: number, patch: Partial<EditableGrnLine>) => void;
  stats: {
    acceptedLines: number;
    rejectedLines: number;
  };
  dirtyLines: EditableGrnLine[];
}

export function useGrnDetailLines(
  initialItems: GrnDetailItem[],
): UseGrnDetailLinesReturn {
  const [lines, setLines] = useState<EditableGrnLine[]>(() =>
    initialItems.map((item) => ({ ...item, dirty: false })),
  );

  const stats = useMemo(() => {
    const acceptedLines = lines.filter(
      (line) => line.actual - line.rejected > 0,
    ).length;
    const rejectedLines = lines.filter((line) => line.rejected > 0).length;
    return { acceptedLines, rejectedLines };
  }, [lines]);

  const dirtyLines = lines.filter((line) => line.dirty);

  function patch(idx: number, patchValue: Partial<EditableGrnLine>) {
    setLines((previous) => {
      const next = previous.slice();
      const current = next[idx];
      if (!current) return previous;
      const merged = { ...current, ...patchValue, dirty: true };
      next[idx] =
        patchValue.actual != null || patchValue.rejected != null
          ? applyGrnLineQuantities(merged)
          : merged;
      return next;
    });
  }

  return { lines, setLines, patch, stats, dirtyLines };
}
