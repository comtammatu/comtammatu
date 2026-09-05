"use client";

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
import {
  AppFilterChips,
  AppFilterChipsBar,
  AppSegmentedControl,
  AppToolbar,
} from "@/components/surface";
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
  members = [],
  showFilters = false,
}: {
  params: ParsedWorkParams;
  departments: Array<{ id: number; name: string }>;
  members?: Array<{ id: string; fullName: string }>;
  showFilters?: boolean;
}) {
  const router = useRouter();
  const controlSize = useFormControlSize();
  const showDepartmentFilter =
    params.view === "board" ||
    params.view === "calendar" ||
    params.view === "timeline";

  const viewSwitcher = (
    <AppSegmentedControl
      value={params.view}
      aria-label={workCopy.viewMode}
      options={VIEW_OPTIONS.map((option) => ({
        value: option.view,
        label: option.label,
        href: workHref(params, { view: option.view }),
      }))}
    />
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

  const memberFilter =
    members.length > 0 ? (
      <Select
        value={params.memberId ?? "all"}
        onValueChange={(value) => {
          router.replace(
            workHref(params, {
              memberId: value === "all" ? null : value,
            }),
          );
        }}
      >
        <SelectTrigger
          className="w-40"
          size={controlSize}
          aria-label={workCopy.filterMember}
        >
          <SelectValue placeholder={workCopy.filterMember} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{workCopy.filterAllMembers}</SelectItem>
          {members.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              {member.fullName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null;

  const quickFilterChips = (
    <AppFilterChipsBar>
      <AppFilterChips
        value={params.filter ?? "all"}
        options={QUICK_FILTER_OPTIONS}
        onChange={(nextFilter) => {
          router.replace(
            workHref(params, {
              filter: nextFilter === "all" ? null : nextFilter,
            }),
          );
        }}
      />
    </AppFilterChipsBar>
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
        actions={
          departmentFilter || memberFilter ? (
            <div className="flex flex-wrap items-center gap-2">
              {departmentFilter}
              {memberFilter}
            </div>
          ) : null
        }
      />
      {quickFilterChips}
    </div>
  );
}
