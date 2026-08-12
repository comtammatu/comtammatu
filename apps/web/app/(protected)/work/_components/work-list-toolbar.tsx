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
  type WorkView,
  workHref,
} from "../_lib/params";

const VIEW_OPTIONS: Array<{ view: WorkView; label: string }> = [
  { view: "mine", label: workCopy.viewMine },
  { view: "board", label: workCopy.viewBoard },
  { view: "calendar", label: workCopy.viewCalendar },
  { view: "timeline", label: workCopy.viewTimeline },
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

  return (
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
        ) : departmentFilter
      }
      actions={showFilters ? departmentFilter : undefined}
    />
  );
}
