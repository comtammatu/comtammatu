"use client";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
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
      className="h-11"
    >
      <ToggleGroupItem
        value="focus"
        aria-label={KDS_VI.viewModeFocusAria}
        className="min-h-11 px-3"
      >
        <IconFocus aria-hidden />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="comprehensive"
        aria-label={KDS_VI.viewModeOverviewAria}
        className="min-h-11 px-3"
      >
        <IconLayoutGrid aria-hidden />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
