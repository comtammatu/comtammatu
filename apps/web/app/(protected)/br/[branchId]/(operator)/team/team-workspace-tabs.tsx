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
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const effectiveValue = tabItems.some((item) => item.value === value)
    ? value
    : "board";

  const activeContent =
    effectiveValue === "board"
      ? board
      : effectiveValue === "members"
        ? members
        : null;

  function handleValueChange(nextValue: string) {
    const nextTab = nextValue as TeamWorkspaceTabValue;
    if (!tabItems.some((item) => item.value === nextTab)) return;
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
        className="min-w-0 max-w-full"
      >
        <TabsList
          size="touch"
          layout="equal"
          aria-label={copy.tabsAriaLabel}
          className="min-w-0 max-w-full items-center"
        >
          {tabItems.map(({ value: tabValue, shortLabel, Icon }) => (
            <TabsTrigger
              key={tabValue}
              value={tabValue}
              className="min-w-0 px-2 text-sm leading-none"
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
        className="mt-0 flex min-w-0 flex-col gap-3"
      >
        {activeContent ?? (isPending ? <PageSkeleton bare /> : null)}
      </TabsContent>
    </Tabs>
  );
}
