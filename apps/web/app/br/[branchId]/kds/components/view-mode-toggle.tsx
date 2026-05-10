"use client";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { LayoutGrid as IconLayoutGrid, Focus as IconFocus } from "lucide-react";
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
      size="touch"
      value={mode}
      onValueChange={(v) => {
        if (!v) return;
        onChange(v as KdsViewMode);
      }}
      aria-label="Chế độ hiển thị KDS"
      className="shrink-0"
    >
      <ToggleGroupItem
        value="comprehensive"
        aria-label="Toàn diện — hiển thị nhiều đơn"
        className="gap-1.5 px-2 text-xs font-semibold sm:px-3"
      >
        <IconLayoutGrid data-icon="inline-start" aria-hidden />
        <span className="hidden sm:inline">Toàn diện</span>
      </ToggleGroupItem>
      <ToggleGroupItem
        value="focus"
        aria-label="Tập trung — 1 đơn full màn hình"
        className="gap-1.5 px-2 text-xs font-semibold sm:px-3"
      >
        <IconFocus data-icon="inline-start" aria-hidden />
        <span className="hidden sm:inline">Tập trung</span>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
