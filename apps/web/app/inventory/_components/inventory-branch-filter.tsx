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
  const currentBranch = useMemo(
    () => branches.find((branch) => branch.id === currentId) ?? null,
    [branches, currentId],
  );

  const handleChange = useCallback(
    (value: string) => {
      // Persist for sidebar nav clicks that drop the query param.
      // Path-scoped to /inventory so it never leaks elsewhere.
      document.cookie = `inv_branch_id=${value}; path=/inventory; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      const next = new URLSearchParams(searchParams.toString());
      next.set("branchId", value);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
      // Invalidate the layout Router Cache so the server re-reads the cookie
      // and subsequent bare-path navigations see the fresh default.
      router.refresh();
    },
    [router, pathname, searchParams],
  );

  if (branches.length <= 1 || currentId == null) return null;

  return (
    <Select value={String(currentId)} onValueChange={handleChange}>
      <SelectTrigger className="h-8 min-w-0 w-full overflow-hidden border-none bg-transparent p-0 text-xs font-medium shadow-none hover:bg-sidebar-accent/60 focus-visible:ring-0 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate">
        <SelectValue placeholder="Chọn chi nhánh">
          <span className="block min-w-0 truncate">
            {currentBranch?.name ?? "Chọn chi nhánh"}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="start" className="min-w-56">
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
