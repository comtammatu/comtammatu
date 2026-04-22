"use client";

import { Search, X } from "lucide-react";
import { Input } from "@comtammatu/ui/components/input";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
import { cn } from "@comtammatu/ui";
import type { DataTableFilter } from "./data-table";

interface DataTableToolbarProps {
  searchable?: boolean;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  filters?: DataTableFilter[];
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  filteredCount?: number;
  totalCount?: number;
  actions?: React.ReactNode;
}

export function DataTableToolbar({
  searchable,
  searchPlaceholder = "Tìm kiếm...",
  searchValue,
  onSearchChange,
  filters,
  filterValues,
  onFilterChange,
  filteredCount,
  totalCount,
  actions,
}: DataTableToolbarProps) {
  const isMobile = useIsMobile();
  const hasActiveFilters =
    (searchValue && searchValue.length > 0) ||
    (filterValues &&
      Object.values(filterValues).some((v) => v && v !== "all"));
  const showCount = filteredCount != null && totalCount != null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        {searchable ? (
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder={searchPlaceholder}
              value={searchValue ?? ""}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className={cn(
                "pl-9",
                isMobile && "h-12",
              )}
              inputMode="search"
            />
          </div>
        ) : null}

        {filters?.map((filter) => (
          <Select
            key={filter.key}
            value={filterValues?.[filter.key] ?? "all"}
            onValueChange={(value) => onFilterChange?.(filter.key, value)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={filter.placeholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả</SelectItem>
              {filter.options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onSearchChange?.("");
              filters?.forEach((f) => onFilterChange?.(f.key, "all"));
            }}
          >
            <X className="mr-1 size-4" />
            Xóa lọc
          </Button>
        )}

        {showCount && (
          <Badge variant="secondary" className="w-fit">
            {filteredCount}/{totalCount}
          </Badge>
        )}
      </div>

      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
