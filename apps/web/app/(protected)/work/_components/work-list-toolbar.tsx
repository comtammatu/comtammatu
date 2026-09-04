"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search as IconSearch } from "lucide-react";
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
import { AppToolbar } from "@/components/surface";
import { useFormControlSize } from "@/components/form/control-size";
import {
  WORK_TASK_STATUSES,
  workCopy,
} from "@lib/messages/work";
import {
  type ParsedWorkParams,
  type WorkGrouping,
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

  const viewFilters = (
    <>
      {VIEW_OPTIONS.map((option) => {
        const active = params.view === option.view;
        return (
          <Button
            key={option.view}
            variant={active ? "secondary" : "ghost"}
            size={controlSize}
            aria-current={active ? "page" : undefined}
            render={<Link href={workHref(params, { view: option.view })} />}
          >
            {option.label}
          </Button>
        );
      })}
    </>
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
          <SelectItem value="all">{workCopy.filterAllDepartments}</SelectItem>
          {departments.map((department) => (
            <SelectItem key={department.id} value={String(department.id)}>
              {department.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null;

  const quickFilterChips = (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      {QUICK_FILTER_OPTIONS.map((option) => {
        const active = (params.filter ?? "all") === option.value;
        return (
          <Button
            key={option.value}
            type="button"
            variant={active ? "secondary" : "outline"}
            size={controlSize}
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

  const isBoard = params.view === "board";

  const boardSearch = isBoard ? (
    <>
      <Select
        value={params.group ?? "status"}
        onValueChange={(value) => {
          router.replace(
            workHref(params, {
              group: value === "status" ? null : (value as WorkGrouping),
            }),
          );
        }}
      >
        <SelectTrigger
          className="w-40"
          size={controlSize}
          aria-label={workCopy.groupingLabel}
        >
          <SelectValue placeholder={workCopy.groupingLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="status">{workCopy.groupStatus}</SelectItem>
          <SelectItem value="priority">{workCopy.groupPriority}</SelectItem>
        </SelectContent>
      </Select>
      <form
        className="min-w-0 flex-1 sm:min-w-64"
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
            <IconSearch />
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
    </>
  ) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <AppToolbar
        variant="inline"
        filters={viewFilters}
        search={
          showFilters ? (
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
                  className="w-40"
                  size={controlSize}
                  aria-label={workCopy.filterStatus}
                >
                  <SelectValue placeholder={workCopy.filterStatus} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{workCopy.filterAllStatuses}</SelectItem>
                  {WORK_TASK_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {workCopy.statusLabels[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <form
                className="min-w-0 flex-1 sm:min-w-72"
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
                    <IconSearch />
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
            </>
          ) : isBoard ? (
            boardSearch
          ) : (
            departmentFilter
          )
        }
        actions={showFilters || isBoard ? departmentFilter : undefined}
      />
      {quickFilterChips}
    </div>
  );
}
