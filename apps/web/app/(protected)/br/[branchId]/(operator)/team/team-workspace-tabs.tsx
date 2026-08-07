"use client";

import {
  useEffect,
  useRef,
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
  shortLabel: string;
  title: string;
  description: string;
  Icon: ComponentType<{
    className?: string;
    "aria-hidden"?: AriaAttributes["aria-hidden"];
  }>;
};

const tabItems: TeamWorkspaceTabItem[] = [
  {
    value: "board",
    shortLabel: copy.tabs.board.shortLabel,
    title: copy.tabs.board.title,
    description: copy.tabs.board.description,
    Icon: IconCalendarCheck,
  },
  {
    value: "members",
    shortLabel: copy.tabs.members.shortLabel,
    title: copy.tabs.members.title,
    description: copy.tabs.members.description,
    Icon: IconUsersRound,
  },
  {
    value: "roster",
    shortLabel: copy.tabs.roster.shortLabel,
    title: copy.tabs.roster.title,
    description: copy.tabs.roster.description,
    Icon: IconCalendarRange,
  },
  {
    value: "attendance",
    shortLabel: copy.tabs.attendance.shortLabel,
    title: copy.tabs.attendance.title,
    description: copy.tabs.attendance.description,
    Icon: IconCalendarClock,
  },
  {
    value: "checkouts",
    shortLabel: copy.tabs.checkouts.shortLabel,
    title: copy.tabs.checkouts.title,
    description: copy.tabs.checkouts.description,
    Icon: IconClipboardCheck,
  },
  {
    value: "leaves",
    shortLabel: copy.tabs.leaves.shortLabel,
    title: copy.tabs.leaves.title,
    description: copy.tabs.leaves.description,
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
  const listRef = useRef<HTMLDivElement>(null);

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
  const activeItem = items[activeIndex] ?? items[0];

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

  // Keep the active trigger in view when the strip is scrollable.
  useEffect(() => {
    if (!scrollable) return;
    const list = listRef.current;
    if (!list) return;
    const active = list.querySelector<HTMLElement>(
      '[data-slot="tabs-trigger"][data-active]',
    );
    active?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
      behavior: "smooth",
    });
  }, [effectiveValue, scrollable]);

  return (
    <Tabs
      value={effectiveValue}
      onValueChange={handleValueChange}
      className="min-w-0 gap-3"
    >
      <div
        ref={listRef}
        className="sticky top-0 z-20 min-w-0 max-w-full bg-background/95 backdrop-blur"
      >
        <TabsList
          size="touch"
          aria-label={copy.tabsAriaLabel}
          style={
            scrollable
              ? undefined
              : { gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))` }
          }
          className={cn(
            "w-full min-w-0 max-w-full items-center",
            scrollable
              ? "flex !w-full touch-pan-x gap-1 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]"
              : "grid overflow-hidden",
          )}
        >
          {!scrollable ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-1 left-1 right-1"
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
              }}
            >
              <span
                className="rounded-md bg-background transition-transform duration-150 motion-reduce:transition-none"
                style={{ transform: `translateX(${activeIndex * 100}%)` }}
              />
            </span>
          ) : null}
          {items.map(({ value: tabValue, shortLabel, Icon }) => (
            <TabsTrigger
              key={tabValue}
              value={tabValue}
              className={cn(
                "relative z-10 min-h-12 items-center justify-center gap-1 px-1 py-0 text-xs leading-none whitespace-nowrap text-muted-foreground sm:gap-2 sm:px-2 sm:text-sm data-active:bg-transparent dark:data-active:border-transparent dark:data-active:bg-transparent",
                scrollable
                  ? "!flex-none min-w-20 shrink-0 flex-col gap-1 px-2.5"
                  : "min-w-0",
                effectiveValue === tabValue && "text-foreground",
              )}
            >
              <Icon aria-hidden="true" className="size-4 shrink-0 sm:size-5" />
              <span className="leading-none whitespace-nowrap">
                {shortLabel}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

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
        {activeItem ? (
          <header className="flex min-w-0 flex-col gap-1">
            <h2 className="font-heading text-base font-semibold leading-snug">
              {activeItem.title}
            </h2>
            <p className="text-xs leading-5 text-muted-foreground">
              {activeItem.description}
            </p>
          </header>
        ) : null}
        {activeContent}
      </TabsContent>
    </Tabs>
  );
}
