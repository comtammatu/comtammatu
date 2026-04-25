"use client";

import type { ComponentType, ReactNode } from "react";
import { X as IconX } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { cn } from "@comtammatu/ui";

export type BulkActionVariant =
  | "default"
  | "outline"
  | "destructive"
  | "secondary"
  | "ghost";

export interface BulkAction {
  key: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  variant?: BulkActionVariant;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

interface InventoryBulkActionBarProps {
  selectedCount: number;
  itemNoun?: string;
  actions: BulkAction[];
  onClear: () => void;
  isPending?: boolean;
  /** Optional slot rendered before the action buttons (e.g. supply-branch picker). */
  leftSlot?: ReactNode;
  className?: string;
}

/**
 * Floating action bar shown when one or more items are selected on an
 * inventory list page. Prop-driven so it can host different actions per
 * surface (Stock = "Tạo PO" / "Yêu cầu cấp hàng", Waste = "Duyệt", etc.).
 *
 * Desktop only — caller decides whether to render on mobile.
 */
export function InventoryBulkActionBar({
  selectedCount,
  itemNoun = "mặt hàng",
  actions,
  onClear,
  isPending,
  leftSlot,
  className,
}: InventoryBulkActionBarProps) {
  if (selectedCount <= 0) return null;

  return (
    <div
      role="region"
      aria-label="Thao tác hàng loạt"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4",
        className,
      )}
    >
      <div className="pointer-events-auto flex max-w-3xl flex-wrap items-center gap-3 border bg-card px-4 py-3 shadow-lg">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary tabular-nums">
            {selectedCount}
          </span>
          <span className="text-sm text-muted-foreground">
            {itemNoun} đã chọn
          </span>
        </div>

        {leftSlot ? (
          <div className="flex items-center gap-2 border-l pl-3">{leftSlot}</div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Button
                key={action.key}
                type="button"
                size="sm"
                variant={
                  action.variant ?? (action.primary ? "default" : "outline")
                }
                onClick={action.onClick}
                disabled={action.disabled || isPending}
              >
                {Icon ? <Icon className="size-3.5" /> : null}
                {action.label}
              </Button>
            );
          })}
        </div>

        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={onClear}
          disabled={isPending}
          aria-label="Bỏ chọn tất cả"
          title="Bỏ chọn tất cả"
        >
          <IconX className="size-4" />
        </Button>
      </div>
    </div>
  );
}
