"use client";

import type { ComponentType, ReactNode } from "react";
import { X as IconX } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@comtammatu/ui/components/sheet";
import { Button } from "@comtammatu/ui/components/button";
import { TouchButton } from "./touch-button";

export type MobileBulkActionVariant =
  | "default"
  | "outline"
  | "destructive"
  | "secondary"
  | "ghost";

export interface MobileBulkAction {
  key: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  variant?: MobileBulkActionVariant;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

interface MobileBulkActionSheetProps {
  selectedCount: number;
  itemNoun?: string;
  actions: MobileBulkAction[];
  onClear: () => void;
  isPending?: boolean;
  /** Optional content rendered above the action list (e.g. supply-branch picker). */
  topSlot?: ReactNode;
}

/**
 * Bottom-sheet variant of `<InventoryBulkActionBar>` for `/inventory/m/*`
 * surfaces. Same `MobileBulkAction[]` contract as the desktop bar so callers
 * pass identical action arrays. Auto-opens when `selectedCount > 0`; the
 * dismiss button calls `onClear()` to drop the selection.
 *
 * Phase Mobile-A1 ships this primitive but no consumer wires it yet —
 * stock/expiry bulk-select is deferred to Mobile-A2 once the long-press vs
 * header-toggle pattern question is settled.
 */
export function MobileBulkActionSheet({
  selectedCount,
  itemNoun = "mục",
  actions,
  onClear,
  isPending,
  topSlot,
}: MobileBulkActionSheetProps) {
  const open = selectedCount > 0;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClear();
      }}
    >
      <SheetContent
        side="bottom"
        className="rounded-t-2xl pb-4"
        showCloseButton={false}
      >
        <SheetHeader className="flex-row items-center justify-between gap-2">
          <SheetTitle className="flex items-center gap-2">
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-base font-semibold tabular-nums text-primary">
              {selectedCount}
            </span>
            <span className="text-sm text-muted-foreground">
              {itemNoun} đã chọn
            </span>
          </SheetTitle>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            onClick={onClear}
            disabled={isPending}
            aria-label="Bỏ chọn tất cả"
          >
            <IconX className="size-4" />
          </Button>
        </SheetHeader>

        {topSlot ? <div className="px-4">{topSlot}</div> : null}

        <div className="flex flex-col gap-2 px-4 pb-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <TouchButton
                key={action.key}
                type="button"
                variant={
                  action.variant ?? (action.primary ? "default" : "outline")
                }
                onClick={action.onClick}
                disabled={action.disabled || isPending}
              >
                {Icon ? <Icon className="size-4" /> : null}
                {action.label}
              </TouchButton>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
