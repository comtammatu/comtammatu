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
import { Filter as IconFilter, X as IconX } from "lucide-react";
import type {
  FilterOption,
  OrderTypeFilter,
  TicketStatusFilter,
} from "../types";

import { ACTIONS_VI } from "@comtammatu/shared/messages";
const TICKET_STATUS_OPTIONS: FilterOption<TicketStatusFilter>[] = [
  { value: "all", label: "Tất cả" },
  { value: "active", label: "Còn việc" },
  { value: "pending", label: "Có món chờ" },
  { value: "preparing", label: "Có món đang làm" },
  { value: "ready", label: "Có món xong" },
];

const ORDER_TYPE_OPTIONS: FilterOption<OrderTypeFilter>[] = [
  { value: "all", label: "Tất cả" },
  { value: "dine_in", label: "Tại bàn" },
  { value: "takeaway", label: "Mang về" },
];

interface FilterBarProps {
  ticketStatusFilter: TicketStatusFilter;
  orderTypeFilter: OrderTypeFilter;
  hasFilters: boolean;
  displayCount: number;
  onStatusChange: (value: TicketStatusFilter) => void;
  onOrderTypeChange: (value: OrderTypeFilter) => void;
  onClearAll: () => void;
}

export function FilterBar({
  ticketStatusFilter,
  orderTypeFilter,
  hasFilters,
  displayCount,
  onStatusChange,
  onOrderTypeChange,
  onClearAll,
}: FilterBarProps) {
  return (
    <div className="border-b px-2 py-1.5 md:px-4 md:py-2">
      <div className="flex min-w-0 items-center gap-2 overflow-x-auto">
        <div className="hidden min-w-0 items-center gap-1.5 text-muted-foreground sm:flex">
          <IconFilter className="size-4 shrink-0" aria-hidden />
          <span className="text-sm font-medium">{ACTIONS_VI.filter}</span>
        </div>

        <Select
          value={ticketStatusFilter}
          onValueChange={(v) => onStatusChange(v as TicketStatusFilter)}
        >
          <SelectTrigger
            size="touch"
            className="w-auto min-w-28 shrink-0 text-sm md:min-w-36"
            aria-label="Lọc theo trạng thái món"
          >
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {TICKET_STATUS_OPTIONS.map((opt) => (
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

        <Select
          value={orderTypeFilter}
          onValueChange={(v) => onOrderTypeChange(v as OrderTypeFilter)}
        >
          <SelectTrigger
            size="touch"
            className="w-auto min-w-24 shrink-0 text-sm md:min-w-32"
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
            size="touch"
            className="shrink-0"
            onClick={onClearAll}
          >
            <IconX data-icon="inline-start" aria-hidden />
            Xóa lọc
          </Button>
        )}

        {displayCount > 0 && (
          <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums text-muted-foreground">
            {displayCount} đơn
          </span>
        )}
      </div>
    </div>
  );
}
