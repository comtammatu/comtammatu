"use client";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@comtammatu/ui/components/tooltip";
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
      className="h-7"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <ToggleGroupItem
            value="focus"
            aria-label="Đang làm — một đơn rõ ràng"
            className="px-2"
          >
            <IconFocus aria-hidden />
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent>Đang làm</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <ToggleGroupItem
            value="comprehensive"
            aria-label="Tổng quan — hiển thị nhiều đơn"
            className="px-2"
          >
            <IconLayoutGrid aria-hidden />
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent>Tổng quan</TooltipContent>
      </Tooltip>
    </ToggleGroup>
  );
}
