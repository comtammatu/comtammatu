import Link from "next/link";
import type { AriaAttributes, ComponentType, ReactNode } from "react";
import {
  CalendarCheck as IconCalendarCheck,
  ClipboardList as IconClipboardList,
  UsersRound as IconUsersRound,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Button } from "@comtammatu/ui/components/button";
import { messages } from "@lib/messages";

const copy = messages.operator.teamBoard;

export type TeamWorkspaceTabValue = "board" | "members" | "assignments";

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
    value: "assignments",
    label: copy.tabs.assignments.label,
    Icon: IconClipboardList,
  },
];

export function TeamWorkspaceTabs({
  activeValue,
  availableValues,
  basePath,
  children,
}: {
  activeValue: TeamWorkspaceTabValue;
  availableValues: TeamWorkspaceTabValue[];
  basePath: string;
  children: ReactNode;
}) {
  const availableItems = tabItems.filter((item) =>
    availableValues.includes(item.value),
  );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {availableItems.length > 1 ? (
        <nav
          aria-label={copy.tabsAriaLabel}
          className="grid min-h-12 w-full gap-1 rounded-md bg-background p-1"
          style={{
            gridTemplateColumns: `repeat(${availableItems.length}, minmax(0, 1fr))`,
          }}
        >
          {availableItems.map(({ value, label, Icon }) => {
            const active = value === activeValue;
            const href =
              value === "board" ? basePath : `${basePath}?tab=${value}`;
            return (
              <Button
                key={value}
                asChild
                size="touch"
                variant={active ? "secondary" : "ghost"}
                className={cn(
                  "min-w-0 justify-center gap-1 px-2 text-xs text-muted-foreground sm:gap-2 sm:text-sm",
                  active && "text-foreground",
                )}
              >
                <Link href={href} aria-current={active ? "page" : undefined}>
                  <Icon
                    aria-hidden="true"
                    className="size-4 shrink-0 sm:size-5"
                  />
                  <span className="min-w-0 truncate">{label}</span>
                </Link>
              </Button>
            );
          })}
        </nav>
      ) : null}
      <div className="flex min-w-0 flex-col gap-3">{children}</div>
    </div>
  );
}
