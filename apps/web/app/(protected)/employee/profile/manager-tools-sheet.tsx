"use client";

import Link from "next/link";
import {
  CalendarDays as IconCalendarEvent,
  ChevronRight as IconChevronRight,
  ClipboardCheck as IconClipboardCheck,
  LayoutDashboard as IconBranchHub,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@comtammatu/ui/components/sheet";
import { messages } from "@lib/messages";

export type ManagerToolIcon = "branchHub" | "checkout" | "hr";

export type ManagerToolSheetLink = {
  key: string;
  href: string;
  icon: ManagerToolIcon;
  title: string;
};

const ICONS = {
  branchHub: IconBranchHub,
  checkout: IconClipboardCheck,
  hr: IconCalendarEvent,
} satisfies Record<ManagerToolIcon, LucideIcon>;

const copy = messages.employee.profile;

export function ManagerToolsSheet({
  links,
}: {
  links: ManagerToolSheetLink[];
}) {
  if (links.length === 0) return null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="touch"
          className="w-full justify-between px-3 text-left transition-[transform,box-shadow] duration-150 hover:shadow-sm active:translate-y-px motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex shrink-0 items-center justify-center rounded-md bg-muted p-2 text-primary">
              <IconBranchHub />
            </span>
            <span className="truncate font-heading text-sm font-medium">
              {copy.managerToolsEntryTitle}
            </span>
          </span>
          <IconChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-dvh gap-0 overflow-y-auto rounded-t-md p-0 chrome-safe-pb"
      >
        <SheetHeader className="pb-3">
          <SheetTitle>{copy.managerToolsSheetTitle}</SheetTitle>
          <SheetDescription className="sr-only">
            {copy.managerToolsSheetDescription}
          </SheetDescription>
        </SheetHeader>
        <ItemGroup className="gap-2 px-6 pb-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200">
          {links.map((link) => {
            const Icon = ICONS[link.icon];
            return (
              <Item
                key={link.key}
                asChild
                variant="outline"
                size="sm"
                className="group/manager-tool bg-card transition-[transform,background-color,border-color,box-shadow] duration-150 hover:bg-muted/50 hover:shadow-sm active:translate-y-px motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 motion-safe:hover:-translate-y-px"
              >
                <Link href={link.href}>
                  <ItemMedia
                    variant="icon"
                    className="rounded-md bg-muted p-2 text-primary transition-colors duration-150 group-hover/manager-tool:bg-primary/10"
                  >
                    <Icon />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{link.title}</ItemTitle>
                  </ItemContent>
                  <ItemActions className="text-muted-foreground">
                    <IconChevronRight />
                  </ItemActions>
                </Link>
              </Item>
            );
          })}
        </ItemGroup>
      </SheetContent>
    </Sheet>
  );
}
