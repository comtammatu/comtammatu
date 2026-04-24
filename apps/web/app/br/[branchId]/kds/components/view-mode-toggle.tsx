"use client";

import { Button } from "@comtammatu/ui/components/button";
import { IconLayoutGrid, IconLayoutList } from "@tabler/icons-react";
import type { KdsViewMode } from "../hooks/use-kds-view-mode";

interface ViewModeToggleProps {
  mode: KdsViewMode;
  onChange: (next: KdsViewMode) => void;
}

export function ViewModeToggle({ mode, onChange }: ViewModeToggleProps) {
  const isFocus = mode === "focus";

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-8 shrink-0 text-xs"
      aria-label={
        isFocus ? "Chuyển sang chế độ tổng quan" : "Chuyển sang chế độ tập trung"
      }
      onClick={() => onChange(isFocus ? "grid" : "focus")}
    >
      {isFocus ? (
        <>
          <IconLayoutGrid data-icon="inline-start" aria-hidden />
          Tổng quan
        </>
      ) : (
        <>
          <IconLayoutList data-icon="inline-start" aria-hidden />
          Tập trung
        </>
      )}
    </Button>
  );
}
