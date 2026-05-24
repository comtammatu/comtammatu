"use client";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { Focus as IconFocus, LayoutGrid as IconLayoutGrid } from "lucide-react";
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
        value="focus"
        aria-label="Đang làm — một đơn rõ ràng"
        className="gap-1.5 px-3 text-xs font-semibold"
      >
        <IconFocus data-icon="inline-start" aria-hidden />
        Đang làm
      </ToggleGroupItem>
      <ToggleGroupItem
        value="comprehensive"
        aria-label="Tổng quan — hiển thị nhiều đơn"
        className="gap-1.5 px-3 text-xs font-semibold"
      >
        <IconLayoutGrid data-icon="inline-start" aria-hidden />
        Tổng quan
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
