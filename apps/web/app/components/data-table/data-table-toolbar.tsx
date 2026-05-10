"use client";

import { Search as IconSearch, X as IconX } from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { useIsMobile } from "@comtammatu/ui/hooks/use-mobile";
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
    (filterValues && Object.values(filterValues).some((v) => v && v !== "all"));
  const showCount = filteredCount != null && totalCount != null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        {searchable ? (
          <InputGroup
            size={isMobile ? "touch" : "default"}
            className="max-w-sm"
          >
            <InputGroupInput
              type="search"
              placeholder={searchPlaceholder}
              value={searchValue ?? ""}
              onChange={(e) => onSearchChange?.(e.target.value)}
              inputMode="search"
            />
            <InputGroupAddon>
              <IconSearch />
            </InputGroupAddon>
          </InputGroup>
        ) : null}

        {filters?.map((filter) => (
          <Select
            key={filter.key}
            value={filterValues?.[filter.key] ?? "all"}
            onValueChange={(value) => onFilterChange?.(filter.key, value)}
          >
            <SelectTrigger className="min-w-40">
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
            <IconX data-icon="inline-start" />
            Xóa lọc
          </Button>
        )}

        {showCount && (
          <Badge variant="secondary" className="w-fit">
            {filteredCount}/{totalCount}
          </Badge>
        )}
      </div>

      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
