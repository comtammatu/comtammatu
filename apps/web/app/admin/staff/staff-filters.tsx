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
import { MANAGEABLE_ROLES } from "./role-labels";
import type { BranchOption } from "./staff-table";

interface StaffFiltersProps {
  branches: BranchOption[];
}

export function StaffFilters({ branches }: StaffFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/admin/staff?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Select
        value={searchParams.get("role") ?? "all"}
        onValueChange={(v) => updateFilter("role", v)}
      >
        <SelectTrigger className="w-45">
          <SelectValue placeholder="Tất cả vai trò" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả vai trò</SelectItem>
          {Object.entries(MANAGEABLE_ROLES).map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("branch") ?? "all"}
        onValueChange={(v) => updateFilter("branch", v)}
      >
        <SelectTrigger className="w-45">
          <SelectValue placeholder="Tất cả chi nhánh" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả chi nhánh</SelectItem>
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
          <SelectValue placeholder="Tất cả trạng thái" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả trạng thái</SelectItem>
          <SelectItem value="active">{ACTIVE_STATE_LABELS_VI.active}</SelectItem>
          <SelectItem value="inactive">
            {ACTIVE_STATE_LABELS_VI.inactive}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
