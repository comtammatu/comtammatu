"use client";

import Link from "next/link";
import { Button } from "@comtammatu/ui/components/button";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";
import { AppToolbar } from "@/components/surface";
import { workCopy } from "@lib/messages/work";
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

export function WorkViewSwitcher({ params }: { params: ParsedWorkParams }) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);

  return (
    <AppToolbar className="flex-wrap">
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
    </AppToolbar>
  );
}
