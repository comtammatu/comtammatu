"use client";

import Link from "next/link";
import { Fragment, type ComponentProps, type ReactNode } from "react";
import { Ellipsis as IconDots } from "lucide-react";
import { Button } from "@comtammatu/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "@comtammatu/ui/components/context-menu";

export type RowActionItem = {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  separatorBefore?: boolean;
};

export type RowActionsMenuProps = {
  items: RowActionItem[];
  label?: string;
  align?: ComponentProps<typeof DropdownMenuContent>["align"];
  triggerSize?: ComponentProps<typeof Button>["size"];
  itemSize?: ComponentProps<typeof DropdownMenuItem>["size"];
  triggerClassName?: string;
  triggerLabel?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function RowActionsMenu({
  items,
  label = "Thao tác",
  align = "end",
  triggerSize = "icon-lg",
  itemSize,
  triggerClassName,
  triggerLabel,
  open,
  onOpenChange,
}: RowActionsMenuProps) {
  const resolvedItemSize =
    itemSize ??
    (triggerSize === "touch" ||
    triggerSize === "touch-lg" ||
    triggerSize === "icon-touch"
      ? "touch"
      : "default");

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size={triggerSize}
            className={triggerClassName}
          >
            <IconDots
              className="size-4"
              data-icon={triggerLabel ? "inline-start" : undefined}
            />
            {triggerLabel ? (
              <span>{triggerLabel}</span>
            ) : (
              <span className="sr-only">{label}</span>
            )}
          </Button>
        }
      />
      <DropdownMenuContent align={align}>
        {items.map((item) => (
          <Fragment key={item.key}>
            {item.separatorBefore ? <DropdownMenuSeparator /> : null}
            {item.href ? (
              <DropdownMenuItem
                size={resolvedItemSize}
                variant={item.destructive ? "destructive" : "default"}
                render={
                  <Link href={item.href}>
                    {item.icon}
                    {item.label}
                  </Link>
                }
              ></DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                size={resolvedItemSize}
                disabled={item.disabled}
                variant={item.destructive ? "destructive" : "default"}
                onClick={() => item.onSelect?.()}
              >
                {item.icon}
                {item.label}
              </DropdownMenuItem>
            )}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RowActionsContextMenuItems({
  items,
}: {
  items: RowActionItem[];
}) {
  return (
    <>
      {items.map((item) => (
        <Fragment key={item.key}>
          {item.separatorBefore ? <ContextMenuSeparator /> : null}
          {item.href ? (
            <ContextMenuItem
              variant={item.destructive ? "destructive" : "default"}
              render={
                <Link href={item.href}>
                  {item.icon}
                  {item.label}
                </Link>
              }
            ></ContextMenuItem>
          ) : (
            <ContextMenuItem
              disabled={item.disabled}
              variant={item.destructive ? "destructive" : "default"}
              onClick={() => item.onSelect?.()}
            >
              {item.icon}
              {item.label}
            </ContextMenuItem>
          )}
        </Fragment>
      ))}
    </>
  );
}
