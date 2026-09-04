"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search as IconSearch } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
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
import { AppToolbar } from "@/components/surface";
import { useFormControlSize } from "@/components/form/control-size";
import {
  WORK_TASK_STATUSES,
  workCopy,
} from "@lib/messages/work";
import {
  type ParsedWorkParams,
  type WorkQuickFilter,
  type WorkView,
  workHref,
} from "../_lib/params";

const VIEW_OPTIONS: Array<{ view: WorkView; label: string }> = [
  { view: "mine", label: workCopy.viewMine },
  { view: "board", label: workCopy.viewBoard },
  { view: "calendar", label: workCopy.viewCalendar },
  { view: "timeline", label: workCopy.viewTimeline },
];

const QUICK_FILTER_OPTIONS: Array<{
  value: WorkQuickFilter;
  label: string;
}> = [
  { value: "all", label: workCopy.filterAll },
  { value: "today", label: workCopy.filterDueToday },
  { value: "overdue", label: workCopy.filterOverdue },
  { value: "urgent", label: workCopy.filterUrgent },
];

export function WorkListToolbar({
  params,
  departments,
  showFilters = false,
}: {
  params: ParsedWorkParams;
  departments: Array<{ id: number; name: string }>;
  showFilters?: boolean;
}) {
  const router = useRouter();
  const controlSize = useFormControlSize();
  const showDepartmentFilter =
    params.view === "board" ||
    params.view === "calendar" ||
    params.view === "timeline";

  const viewSwitcher = (
    <Frame className="inline-flex items-center bg-muted/30 p-0.5">
      {VIEW_OPTIONS.map((option) => {
        const active = params.view === option.view;
        return (
          <Button
            key={option.view}
            variant={active ? "secondary" : "ghost"}
            size={controlSize}
            aria-current={active ? "page" : undefined}
            className={`h-7 px-2.5 text-xs transition-colors ${
              active ? "bg-background font-medium text-foreground shadow-2xs" : ""
            }`}
            render={<Link href={workHref(params, { view: option.view })} />}
          >
            {option.label}
          </Button>
        );
      })}
    </Frame>
  );

  const departmentFilter =
    showDepartmentFilter && departments.length > 0 ? (
      <Select
        value={params.departmentId != null ? String(params.departmentId) : "all"}
        onValueChange={(value) => {
          router.replace(
            workHref(params, {
              departmentId: value === "all" ? null : Number(value),
            }),
          );
        }}
      >
        <SelectTrigger
          className="w-44"
          size={controlSize}
          aria-label={workCopy.scopeDepartment}
        >
          <SelectValue placeholder={workCopy.scopeDepartment} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            {params.view === "board"
              ? workCopy.allDepartments
              : workCopy.filterAllDepartments}
          </SelectItem>
          {departments.map((department) => (
            <SelectItem key={department.id} value={String(department.id)}>
              {department.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null;

  const quickFilterChips = (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-border/20 bg-muted/30 px-3 py-1.5">
      {QUICK_FILTER_OPTIONS.map((option) => {
        const active = (params.filter ?? "all") === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            variant={active ? "secondary" : "outline"}
            size={controlSize}
            className={`h-6.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
              active ? "bg-foreground text-background hover:bg-foreground/90" : ""
            }`}
            onClick={() => {
              router.replace(
                workHref(params, {
                  filter: option.value === "all" ? null : option.value,
                }),
              );
            }}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );

  const searchForm = (
    <form
      className="min-w-0 flex-1 sm:max-w-xs"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const q = String(data.get("q") ?? "").trim();
        router.replace(workHref(params, { q: q.length > 0 ? q : null }));
      }}
    >
      <InputGroup size={controlSize} className="w-full">
        <InputGroupAddon>
          <IconSearch className="size-4 opacity-50" />
        </InputGroupAddon>
        <InputGroupInput
          name="q"
          type="search"
          defaultValue={params.q ?? ""}
          placeholder={workCopy.filterSearch}
          aria-label={workCopy.filterSearch}
        />
      </InputGroup>
    </form>
  );

  return (
    <div className="flex flex-col">
      <AppToolbar
        variant="inline"
        search={
          <div className="flex flex-wrap items-center gap-2">
            {searchForm}
            {showFilters ? (
              <>
                <Button
                  type="button"
                  variant={params.includeDone ? "secondary" : "outline"}
                  size={controlSize}
                  onClick={() => {
                    router.replace(
                      workHref(params, { includeDone: !params.includeDone }),
                    );
                  }}
                >
                  {workCopy.includeDone}
                </Button>
                <Select
                  value={params.status ?? "all"}
                  onValueChange={(value) => {
                    router.replace(
                      workHref(params, {
                        status:
                          value === "all" ? null : (value as typeof params.status),
                      }),
                    );
                  }}
                >
                  <SelectTrigger
                    className="w-36"
                    size={controlSize}
                    aria-label={workCopy.filterStatus}
                  >
                    <SelectValue placeholder={workCopy.filterStatus} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {workCopy.filterAllStatuses}
                    </SelectItem>
                    {WORK_TASK_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {workCopy.statusLabels[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : null}
          </div>
        }
        filters={viewSwitcher}
        actions={departmentFilter}
      />
      {quickFilterChips}
    </div>
  );
}
