"use client";

import {
  useState,
  type AriaAttributes,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  CalendarCheck as IconCalendarCheck,
  CalendarClock as IconCalendarClock,
  CalendarRange as IconCalendarRange,
  ClipboardCheck as IconClipboardCheck,
  UsersRound as IconUsersRound,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@comtammatu/ui/components/tabs";
import { messages } from "@lib/messages";

const copy = messages.operator.teamBoard;

export type TeamWorkspaceTabValue =
  | "board"
  | "members"
  | "roster"
  | "attendance"
  | "checkouts"
  | "leaves";

type TeamWorkspaceTabItem = {
  value: TeamWorkspaceTabValue;
  label: string;
  Icon: ComponentType<{
    className?: string;
    "aria-hidden"?: AriaAttributes["aria-hidden"];
  }>;
};

const tabItems: TeamWorkspaceTabItem[] = [
  {
    value: "board",
    label: copy.tabs.board.label,
    Icon: IconCalendarCheck,
  },
  {
    value: "members",
    label: copy.tabs.members.label,
    Icon: IconUsersRound,
  },
  {
    value: "roster",
    label: copy.tabs.roster.label,
    Icon: IconCalendarRange,
  },
  {
    value: "attendance",
    label: copy.tabs.attendance.label,
    Icon: IconCalendarClock,
  },
  {
    value: "checkouts",
    label: copy.tabs.checkouts.label,
    Icon: IconClipboardCheck,
  },
  {
    value: "leaves",
    label: copy.tabs.leaves.label,
    Icon: IconCalendarCheck,
  },
];

function replaceTabInUrl(value: TeamWorkspaceTabValue) {
  const url = new URL(window.location.href);
  if (value === "board") url.searchParams.delete("tab");
  else url.searchParams.set("tab", value);
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

export function TeamWorkspaceTabs({
  initialValue,
  visibleTabs,
  board,
  members,
  roster,
  attendance,
  checkouts,
  leaves,
}: {
  initialValue: TeamWorkspaceTabValue;
  /** Visible tabs; the grid + sliding indicator adapt to this count. */
  visibleTabs: readonly TeamWorkspaceTabValue[];
  board: ReactNode;
  members: ReactNode;
  roster: ReactNode;
  attendance: ReactNode;
  checkouts: ReactNode;
  leaves: ReactNode;
}) {
  const [value, setValue] = useState<TeamWorkspaceTabValue>(initialValue);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");

  const items = tabItems.filter((item) => visibleTabs.includes(item.value));
  const colCount = Math.max(2, items.length);
  // With 4+ tabs the equal-column grid cramps each trigger on narrow phones.
  // Fall back to a horizontally scrollable strip with fixed-width triggers.
  const scrollable = colCount > 3;

  // Keep the active tab inside the visible set; fall back to the first tab.
  const effectiveValue = items.some((item) => item.value === value)
    ? value
    : (items[0]?.value ?? "board");

  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.value === effectiveValue),
  );

  const activeContent = (() => {
    switch (effectiveValue) {
      case "board":
        return board;
      case "members":
        return members;
      case "roster":
        return roster;
      case "attendance":
        return attendance;
      case "checkouts":
        return checkouts;
      case "leaves":
        return leaves;
    }
  })();

  function handleValueChange(nextValue: string) {
    const nextTab = nextValue as TeamWorkspaceTabValue;
    const nextIndex = Math.max(
      0,
      items.findIndex((item) => item.value === nextTab),
    );
    setDirection(nextIndex >= activeIndex ? "forward" : "backward");
    setValue(nextTab);
    replaceTabInUrl(nextTab);
  }

  return (
    <Tabs value={effectiveValue} onValueChange={handleValueChange} className="gap-3">
      <TabsList
        size="touch"
        aria-label={copy.tabsAriaLabel}
        style={
          scrollable
            ? undefined
            : { gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }
        }
        className={cn(
          "sticky top-0 z-20 w-full items-center bg-background/95 backdrop-blur",
          scrollable
            ? "no-scrollbar flex touch-pan-x gap-1 overflow-x-auto overscroll-x-contain"
            : "grid overflow-hidden",
        )}
      >
        {!scrollable ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-1 left-1 right-1"
            style={{ display: "grid", gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }}
          >
            <span
              className="rounded-md bg-background transition-transform duration-150 motion-reduce:transition-none"
              style={{ transform: `translateX(${activeIndex * 100}%)` }}
            />
          </span>
        ) : null}
        {items.map(({ value: tabValue, label, Icon }) => (
          <TabsTrigger
            key={tabValue}
            value={tabValue}
            className={cn(
              "relative z-10 min-h-12 items-center justify-center gap-1 px-1 py-0 text-xs leading-none text-muted-foreground sm:gap-2 sm:px-2 sm:text-sm data-active:bg-transparent dark:data-active:border-transparent dark:data-active:bg-transparent",
              scrollable
                ? "min-w-20 shrink-0 flex-col gap-1"
                : "min-w-0",
              effectiveValue === tabValue && "text-foreground",
            )}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0 sm:size-5" />
            <span
              className={cn(
                "min-w-0 leading-none",
                scrollable
                  ? "max-w-full truncate text-center"
                  : "truncate",
              )}
            >
              {label}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent
        key={effectiveValue}
        value={effectiveValue}
        className={cn(
          "mt-0 flex min-w-0 flex-col gap-3 data-open:duration-150 motion-reduce:transform-none motion-reduce:animate-none",
          direction === "forward"
            ? "data-open:slide-in-from-right-2"
            : "data-open:slide-in-from-left-2",
        )}
      >
        {activeContent}
      </TabsContent>
    </Tabs>
  );
}
