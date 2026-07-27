"use client";

import { useEffect, useState, useTransition } from "react";
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
import { Button } from "@comtammatu/ui/components/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@comtammatu/ui/components/input-group";
import { Search as IconSearch } from "lucide-react";
import { useFormControlSize } from "@/components/form/control-size";
import { AppToolbar } from "@/components/surface";
import { messages } from "@lib/messages";
import type { BranchOption, PositionOption } from "./staff-table";

interface StaffFiltersProps {
  branches: BranchOption[];
  positionOptions: PositionOption[];
}

export function StaffFilters({ branches, positionOptions }: StaffFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const controlSize = useFormControlSize();
  const [isPending, startTransition] = useTransition();
  const query = searchParams.get("q") ?? "";
  const [search, setSearch] = useState(query);
  const hasActiveFilters = Boolean(
    query ||
    searchParams.get("position") ||
    searchParams.get("branch") ||
    searchParams.get("status"),
  );

  useEffect(() => {
    setSearch(query);
  }, [query]);

  function replaceParams(params: URLSearchParams) {
    const next = params.toString();
    startTransition(() => {
      router.replace(next ? `/hr/staff?${next}` : "/hr/staff", {
        scroll: false,
      });
    });
  }

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (key !== "q") {
      if (search.trim()) params.set("q", search.trim());
      else params.delete("q");
    }
    if (value === "all" || !value.trim()) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    replaceParams(params);
  }

  return (
    <AppToolbar
      variant="inline"
      search={
        <InputGroup
          size={controlSize}
          className="min-w-0 flex-1 sm:min-w-64"
        >
          <InputGroupAddon>
            <IconSearch />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            name="q"
            autoComplete="off"
            aria-label={messages.owner.staffPage.searchPlaceholder}
            placeholder={messages.owner.staffPage.searchPlaceholder}
            value={search}
            onChange={(event) => {
              const next = event.target.value;
              setSearch(next);
              updateFilter("q", next);
            }}
          />
        </InputGroup>
      }
      filters={
        <>
          <Select
            value={searchParams.get("position") ?? "all"}
            onValueChange={(v) => updateFilter("position", v)}
            disabled={isPending}
          >
            <SelectTrigger
              size={controlSize}
              className="w-45"
              aria-label={HR_VI.allRoles}
            >
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
            disabled={isPending}
          >
            <SelectTrigger
              size={controlSize}
              className="w-45"
              aria-label={BRANCH_VI.selectAll}
            >
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
            disabled={isPending}
          >
            <SelectTrigger
              size={controlSize}
              className="w-40"
              aria-label={HR_VI.allStatuses}
            >
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
        </>
      }
      reset={
        hasActiveFilters ? (
          <Button
            variant="ghost"
            size={controlSize}
            onClick={() => {
              setSearch("");
              replaceParams(new URLSearchParams());
            }}
            disabled={isPending}
          >
            {messages.owner.staffPage.resetFilters}
          </Button>
        ) : null
      }
    />
  );
}
