"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type AriaAttributes,
  type ComponentType,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
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
import { PageSkeleton } from "@/components/page-skeleton";
import { messages } from "@lib/messages";

const copy = messages.operator.teamBoard;

export type TeamWorkspaceTabValue = "board" | "members";

type TeamWorkspaceTabItem = {
  value: TeamWorkspaceTabValue;
  shortLabel: string;
  Icon: ComponentType<{
    className?: string;
    "aria-hidden"?: AriaAttributes["aria-hidden"];
  }>;
};

const tabItems: TeamWorkspaceTabItem[] = [
  {
    value: "board",
    shortLabel: copy.tabs.board.shortLabel,
    Icon: IconCalendarCheck,
  },
  {
    value: "members",
    shortLabel: copy.tabs.members.shortLabel,
    Icon: IconUsersRound,
  },
];

export function TeamWorkspaceTabs({
  initialValue,
  board,
  members,
}: {
  initialValue: TeamWorkspaceTabValue;
  board: ReactNode;
  members: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTabTransition] = useTransition();
  const [value, setValue] = useState<TeamWorkspaceTabValue>(initialValue);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const effectiveValue = tabItems.some((item) => item.value === value)
    ? value
    : "board";

  const activeIndex = Math.max(
    0,
    tabItems.findIndex((item) => item.value === effectiveValue),
  );

  const activeContent =
    effectiveValue === "board"
      ? board
      : effectiveValue === "members"
        ? members
        : null;

  function handleValueChange(nextValue: string) {
    const nextTab = nextValue as TeamWorkspaceTabValue;
    if (!tabItems.some((item) => item.value === nextTab)) return;
    const nextIndex = Math.max(
      0,
      tabItems.findIndex((item) => item.value === nextTab),
    );
    setDirection(nextIndex >= activeIndex ? "forward" : "backward");
    setValue(nextTab);

    const params = new URLSearchParams();
    if (nextTab !== "board") params.set("tab", nextTab);
    const q = params.toString();
    startTabTransition(() => {
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    });
  }

  useEffect(() => {
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
  }, [effectiveValue]);

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
          style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
          className="grid w-full min-w-0 max-w-full items-center overflow-hidden"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-1 left-1 right-1"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            }}
          >
            <span
              className="rounded-md bg-background transition-transform duration-150 motion-reduce:transition-none"
              style={{ transform: `translateX(${activeIndex * 100}%)` }}
            />
          </span>
          {tabItems.map(({ value: tabValue, shortLabel, Icon }) => (
            <TabsTrigger
              key={tabValue}
              value={tabValue}
              className={cn(
                "relative z-10 min-h-12 min-w-0 items-center justify-center gap-1.5 px-2 py-0 text-sm leading-none whitespace-nowrap text-muted-foreground data-active:bg-transparent dark:data-active:border-transparent dark:data-active:bg-transparent",
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
        {activeContent ?? (isPending ? <PageSkeleton bare /> : null)}
      </TabsContent>
    </Tabs>
  );
}
