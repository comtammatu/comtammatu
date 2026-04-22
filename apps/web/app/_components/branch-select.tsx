"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { Label } from "@comtammatu/ui/components/label";

export interface BranchOption {
  id: number;
  name: string;
}

interface BranchSelectProps {
  /** All selectable branches (active, branch_kind='branch') */
  branches: BranchOption[];
  /** Currently selected branch id */
  selectedBranchId: number;
  /**
   * When true the selector is disabled and shows only the locked branch.
   * Used for branch_manager role whose branch is fixed in JWT claims.
   */
  locked?: boolean;
}

/**
 * Client component — syncs selected branch to `?branchId=<id>` URL param.
 * Place in RSC pages just below the page header card.
 */
export function BranchSelect({
  branches,
  selectedBranchId,
  locked = false,
}: BranchSelectProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("branchId", value);
    router.push(`?${params.toString()}`);
  }

  const selectedBranch = branches.find((b) => b.id === selectedBranchId);

  if (locked) {
    return (
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground shrink-0">
          Chi nhánh
        </Label>
        <div className="flex h-7 items-center rounded-md border border-input bg-muted/50 px-2 text-xs text-muted-foreground">
          {selectedBranch?.name ?? "—"}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-muted-foreground shrink-0">
        Chi nhánh
      </Label>
      <Select
        value={String(selectedBranchId)}
        onValueChange={handleChange}
      >
        <SelectTrigger className="h-7 min-w-[10rem] max-w-xs text-xs">
          <SelectValue placeholder="Chọn chi nhánh" />
        </SelectTrigger>
        <SelectContent>
          {branches.map((branch) => (
            <SelectItem key={branch.id} value={String(branch.id)}>
              {branch.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
