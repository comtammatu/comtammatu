"use client";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import {
  LayoutGrid as IconLayoutGrid,
  Focus as IconFocus,
} from "lucide-react";
import type { KdsViewMode } from "../hooks/use-kds-view-mode";

interface ViewModeToggleProps {
  mode: KdsViewMode;
  onChange: (next: KdsViewMode) => void;
}

export function ViewModeToggle({ mode, onChange }: ViewModeToggleProps) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={mode}
      onValueChange={(v) => {
        if (!v) return;
        onChange(v as KdsViewMode);
      }}
      aria-label="Chế độ hiển thị KDS"
      className="h-8"
    >
      <ToggleGroupItem
        value="comprehensive"
        aria-label="Toàn diện — hiển thị nhiều đơn"
        className="gap-1.5 px-3 text-xs font-semibold"
      >
        <IconLayoutGrid data-icon="inline-start" aria-hidden />
        Toàn diện
      </ToggleGroupItem>
      <ToggleGroupItem
        value="focus"
        aria-label="Tập trung — 1 đơn full màn hình"
        className="gap-1.5 px-3 text-xs font-semibold"
      >
        <IconFocus data-icon="inline-start" aria-hidden />
        Tập trung
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
