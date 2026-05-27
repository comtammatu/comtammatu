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
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@comtammatu/ui/components/toggle-group";
import { X as IconX } from "lucide-react";
import type { FilterOption, KdsSectionFilter, OrderTypeFilter } from "../types";

const ORDER_TYPE_OPTIONS: FilterOption<OrderTypeFilter>[] = [
  { value: "all", label: "Tất cả" },
  { value: "dine_in", label: "Tại bàn" },
  { value: "takeaway", label: "Mang về" },
];

interface FilterBarProps {
  sectionFilter: KdsSectionFilter;
  orderTypeFilter: OrderTypeFilter;
  hasFilters: boolean;
  displayCount: number;
  activeCount: number;
  doneCount: number;
  onSectionChange: (value: KdsSectionFilter) => void;
  onOrderTypeChange: (value: OrderTypeFilter) => void;
  onClearAll: () => void;
}

export function FilterBar({
  sectionFilter,
  orderTypeFilter,
  hasFilters,
  displayCount,
  activeCount,
  doneCount,
  onSectionChange,
  onOrderTypeChange,
  onClearAll,
}: FilterBarProps) {
  return (
    <div className="shrink-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <ToggleGroup
          type="single"
          variant="outline"
          value={sectionFilter}
          onValueChange={(value) => {
            if (value === "active" || value === "done") {
              onSectionChange(value);
            }
          }}
          aria-label="Mục KDS"
          className="h-8 shrink-0"
        >
          <ToggleGroupItem
            value="active"
            aria-label={`Đang làm ${activeCount} đơn`}
            className="gap-1.5 px-2.5 text-sm"
          >
            <span>Đang làm</span>
            <span className="font-mono text-xs font-semibold tabular-nums text-muted-foreground">
              {activeCount}
            </span>
          </ToggleGroupItem>
          <ToggleGroupItem
            value="done"
            aria-label={`Đã xong ${doneCount} đơn`}
            className="gap-1.5 px-2.5 text-sm"
          >
            <span>Đã xong</span>
            <span className="font-mono text-xs font-semibold tabular-nums text-muted-foreground">
              {doneCount}
            </span>
          </ToggleGroupItem>
        </ToggleGroup>

        <Select
          value={orderTypeFilter}
          onValueChange={(v) => onOrderTypeChange(v as OrderTypeFilter)}
        >
          <SelectTrigger
            className="w-auto min-w-24 shrink-0 text-sm"
            aria-label="Lọc theo loại đơn"
          >
            <SelectValue placeholder="Loại đơn" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {ORDER_TYPE_OPTIONS.map((opt) => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  className="text-sm"
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
            size="icon-sm"
            className="shrink-0"
            aria-label="Xóa lọc"
            onClick={onClearAll}
          >
            <IconX aria-hidden />
          </Button>
        )}

        {displayCount > 0 && (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
            {displayCount} đơn
          </span>
        )}
      </div>
    </div>
  );
}
