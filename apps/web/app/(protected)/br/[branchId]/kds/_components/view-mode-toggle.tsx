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
import { KDS_VI } from "@comtammatu/shared/messages";
import type { KdsViewMode } from "../_hooks/use-kds-view-mode";

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
      aria-label={KDS_VI.viewModeAria}
      className="h-8"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <ToggleGroupItem
            value="focus"
            aria-label={KDS_VI.viewModeFocusAria}
            className="px-2"
          >
            <IconFocus aria-hidden />
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent>{KDS_VI.viewModeFocusTooltip}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <ToggleGroupItem
            value="comprehensive"
            aria-label={KDS_VI.viewModeOverviewAria}
            className="px-2"
          >
            <IconLayoutGrid aria-hidden />
          </ToggleGroupItem>
        </TooltipTrigger>
        <TooltipContent>{KDS_VI.viewModeOverviewTooltip}</TooltipContent>
      </Tooltip>
    </ToggleGroup>
  );
}
