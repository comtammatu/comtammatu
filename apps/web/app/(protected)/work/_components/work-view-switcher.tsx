"use client";

import Link from "next/link";
import { cn } from "@comtammatu/ui";
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
  return (
    <nav
      aria-label={workCopy.pageTitle}
      className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-1"
    >
      {VIEW_OPTIONS.map((option) => {
        const active = params.view === option.view;
        return (
          <Link
            key={option.view}
            href={workHref(params, { view: option.view })}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
