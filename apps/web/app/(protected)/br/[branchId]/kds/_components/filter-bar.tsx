"use client";

import { Button } from "@comtammatu/ui/components/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { X as IconX } from "lucide-react";
import { ORDER_TYPE_LABELS_VI } from "@comtammatu/shared/labels";
import { ACTIONS_VI, KDS_VI } from "@comtammatu/shared/messages";
import type { FilterOption, OrderTypeFilter } from "../types";

const ORDER_TYPE_OPTIONS: FilterOption<OrderTypeFilter>[] = [
  { value: "all", label: KDS_VI.filterAll },
  { value: "dine_in", label: ORDER_TYPE_LABELS_VI.dine_in },
  { value: "takeaway", label: ORDER_TYPE_LABELS_VI.takeaway },
];

interface FilterBarProps {
  orderTypeFilter: OrderTypeFilter;
  hasFilters: boolean;
  displayCount: number;
  onOrderTypeChange: (value: OrderTypeFilter) => void;
  onClearAll: () => void;
}

export function FilterBar({
  orderTypeFilter,
  hasFilters,
  displayCount,
  onOrderTypeChange,
  onClearAll,
}: FilterBarProps) {
  return (
    <div className="shrink-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <Select
          value={orderTypeFilter}
          onValueChange={(v) => onOrderTypeChange(v as OrderTypeFilter)}
        >
          <SelectTrigger
            size="touch"
            className="w-auto min-w-28 shrink-0"
            aria-label={KDS_VI.filterOrderTypeAria}
          >
            <SelectValue placeholder={KDS_VI.filterOrderTypePlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {ORDER_TYPE_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    size="touch"
                  >
                  {opt.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button
            type="button"
            variant="ghost"
            size="icon-touch"
            className="shrink-0"
            aria-label={ACTIONS_VI.clearFilter}
            onClick={onClearAll}
          >
            <IconX aria-hidden />
          </Button>
        )}

        {displayCount > 0 && (
          <span className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold tabular-nums text-muted-foreground">
            {displayCount} {KDS_VI.unitOrder}
          </span>
        )}
      </div>
    </div>
  );
}
