"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@comtammatu/ui/components/button";
import { Input } from "@comtammatu/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@comtammatu/ui/components/select";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
import { AppToolbar } from "@/components/surface";
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
  trailing,
  showFilters = false,
}: {
  params: ParsedWorkParams;
  trailing?: React.ReactNode;
  showFilters?: boolean;
}) {
  const router = useRouter();
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

  return (
    <AppToolbar variant="inline" className="flex-wrap gap-2">
      {VIEW_OPTIONS.map((option) => {
        const active = params.view === option.view;
        return (
          <Button
            key={option.view}
            variant={active ? "secondary" : "ghost"}
            size={isTouchLayout ? "touch" : "default"}
            aria-current={active ? "page" : undefined}
            render={<Link href={workHref(params, { view: option.view })} />}
          >
            {option.label}
          </Button>
        );
      })}

      {showFilters ? (
        <>
          <Select
            value={params.status ?? "all"}
            onValueChange={(value) => {
              router.replace(
                workHref(params, {
                  status: value === "all" ? null : (value as typeof params.status),
                }),
              );
            }}
          >
            <SelectTrigger className="w-40" size={isTouchLayout ? "touch" : "default"}>
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
            className="min-w-40 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const data = new FormData(form);
              const q = String(data.get("q") ?? "").trim();
              router.replace(workHref(params, { q: q.length > 0 ? q : null }));
            }}
          >
            <Input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder={workCopy.filterSearch}
              aria-label={workCopy.filterSearch}
            />
          </form>
        </>
      ) : null}

      {trailing}
    </AppToolbar>
  );
}
