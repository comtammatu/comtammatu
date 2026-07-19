"use client";

import {
  useState,
  type AriaAttributes,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  CalendarCheck as IconCalendarCheck,
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

export type TeamWorkspaceTabValue = "board" | "members";

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
  board,
  members,
}: {
  initialValue: TeamWorkspaceTabValue;
  board: ReactNode;
  members: ReactNode;
}) {
  const [value, setValue] = useState<TeamWorkspaceTabValue>(initialValue);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const activeIndex = Math.max(
    0,
    tabItems.findIndex((item) => item.value === value),
  );
  const activeContent = value === "board" ? board : members;

  function handleValueChange(nextValue: string) {
    const nextTab = nextValue as TeamWorkspaceTabValue;
    const nextIndex = Math.max(
      0,
      tabItems.findIndex((item) => item.value === nextTab),
    );
    setDirection(nextIndex >= activeIndex ? "forward" : "backward");
    setValue(nextTab);
    replaceTabInUrl(nextTab);
  }

  return (
    <Tabs value={value} onValueChange={handleValueChange} className="gap-3">
      <TabsList
        aria-label={copy.tabsAriaLabel}
        className="sticky top-0 z-20 grid h-12 min-h-12 w-full grid-cols-2 items-center overflow-hidden rounded-md bg-background/95 p-1 backdrop-blur group-data-horizontal/tabs:!h-12"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-1 left-1 right-1 grid grid-cols-2"
        >
          <span
            className="rounded-md bg-background transition-transform duration-150 motion-reduce:transition-none"
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
          />
        </span>
        {tabItems.map(({ value: tabValue, label, Icon }) => (
          <TabsTrigger
            key={tabValue}
            value={tabValue}
            className={cn(
              "relative z-10 h-10 min-w-0 items-center justify-center gap-1 px-1 py-0 text-xs leading-none text-muted-foreground sm:gap-2 sm:px-2 sm:text-sm data-active:bg-transparent dark:data-active:border-transparent dark:data-active:bg-transparent",
              value === tabValue && "text-foreground",
            )}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0 sm:size-5" />
            <span className="min-w-0 whitespace-nowrap leading-none">
              {label}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent
        key={value}
        value={value}
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
