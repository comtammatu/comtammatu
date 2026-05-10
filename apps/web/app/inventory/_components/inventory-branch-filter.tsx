"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Store as IconBuildingStore } from "lucide-react";
import { getInventorySiteKindLabelVi } from "@comtammatu/shared/labels";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import type { InventoryBranchOption } from "../_lib/inventory-scope";

import { BRANCH_VI } from "@comtammatu/shared/messages";
interface InventoryBranchFilterProps {
  branches: InventoryBranchOption[];
  defaultBranchId: number | null;
}

export function InventoryBranchFilter({
  branches,
  defaultBranchId,
}: InventoryBranchFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentId = useMemo(() => {
    const raw = searchParams.get("branchId");
    if (!raw) return defaultBranchId;
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed <= 0) return defaultBranchId;
    if (!branches.some((b) => b.id === parsed)) return defaultBranchId;
    return parsed;
  }, [searchParams, defaultBranchId, branches]);
  const currentBranch = useMemo(
    () => branches.find((branch) => branch.id === currentId) ?? null,
    [branches, currentId],
  );

  const handleChange = useCallback(
    (value: string) => {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed === currentId) {
        return;
      }
      const next = new URLSearchParams(searchParams.toString());
      next.set("branchId", String(parsed));
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [currentId, router, pathname, searchParams],
  );

  if (branches.length <= 1 || currentId == null) return null;

  return (
    <Select value={String(currentId)} onValueChange={handleChange}>
      <SelectTrigger className="min-w-0 w-full justify-start overflow-hidden border bg-sidebar-accent/40 text-left font-medium text-sidebar-foreground shadow-none hover:bg-sidebar-accent/60 focus-visible:ring-sidebar-ring [&>svg:last-child]:ml-auto [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:flex-1 [&_[data-slot=select-value]]:truncate">
        <IconBuildingStore className="size-4 shrink-0" />
        <SelectValue placeholder={BRANCH_VI.select}>
          <span className="block min-w-0 truncate">
            {currentBranch?.name ?? "Chọn chi nhánh"}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        align="start"
        className="no-scrollbar max-h-64 min-w-56 [&_[data-position=popper]]:h-auto"
        position="popper"
        side="bottom"
        sideOffset={4}
      >
        {branches.map((branch) => {
          const kindLabel = getInventorySiteKindLabelVi(branch.branch_kind);
          const showKind = kindLabel && kindLabel !== branch.name;
          return (
            <SelectItem
              key={branch.id}
              value={String(branch.id)}
              textValue={branch.name}
              className="pr-8"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate text-sm">{branch.name}</span>
                {showKind ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    · {kindLabel}
                  </span>
                ) : null}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
