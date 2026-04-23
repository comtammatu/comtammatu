"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getInventorySiteKindLabelVi } from "@comtammatu/shared/labels";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import type { InventoryBranchOption } from "../_lib/inventory-scope";

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

  const handleChange = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set("branchId", value);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [router, pathname, searchParams],
  );

  if (branches.length <= 1 || currentId == null) return null;

  return (
    <Select value={String(currentId)} onValueChange={handleChange}>
      <SelectTrigger className="h-8 w-full border-none bg-transparent p-0 text-xs font-medium shadow-none hover:bg-sidebar-accent/60 focus-visible:ring-0">
        <SelectValue placeholder="Chọn chi nhánh" />
      </SelectTrigger>
      <SelectContent align="start">
        {branches.map((branch) => {
          const kindLabel = getInventorySiteKindLabelVi(branch.branch_kind);
          return (
            <SelectItem key={branch.id} value={String(branch.id)}>
              <div className="flex flex-col">
                <span className="truncate text-sm">{branch.name}</span>
                {kindLabel && kindLabel !== branch.name ? (
                  <span className="text-xs text-muted-foreground">
                    {kindLabel}
                  </span>
                ) : null}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
