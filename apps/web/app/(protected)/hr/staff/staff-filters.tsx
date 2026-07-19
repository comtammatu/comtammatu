"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import { ACTIVE_STATE_LABELS_VI } from "@comtammatu/shared/labels";
import { BRANCH_VI, HR_VI } from "@comtammatu/shared/messages";
import type { BranchOption, PositionOption } from "./staff-table";

interface StaffFiltersProps {
  branches: BranchOption[];
  positionOptions: PositionOption[];
}

export function StaffFilters({
  branches,
  positionOptions,
}: StaffFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/hr/staff?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Select
        value={searchParams.get("position") ?? "all"}
        onValueChange={(v) => updateFilter("position", v)}
      >
        <SelectTrigger className="w-45">
          <SelectValue placeholder={HR_VI.allRoles} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{HR_VI.allRoles}</SelectItem>
          {positionOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("branch") ?? "all"}
        onValueChange={(v) => updateFilter("branch", v)}
      >
        <SelectTrigger className="w-45">
          <SelectValue placeholder={BRANCH_VI.selectAll} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{BRANCH_VI.selectAll}</SelectItem>
          {branches.map((b) => (
            <SelectItem key={b.id} value={b.id.toString()}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("status") ?? "all"}
        onValueChange={(v) => updateFilter("status", v)}
      >
        <SelectTrigger className="w-40">
          <SelectValue placeholder={HR_VI.allStatuses} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{HR_VI.allStatuses}</SelectItem>
          <SelectItem value="active">
            {ACTIVE_STATE_LABELS_VI.active}
          </SelectItem>
          <SelectItem value="inactive">
            {ACTIVE_STATE_LABELS_VI.inactive}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
