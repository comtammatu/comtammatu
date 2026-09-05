"use client";

import { Fragment, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { Ellipsis as IconDots } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import {
  ContextMenuItem,
  ContextMenuSeparator,
} from "./context-menu";

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

export type RowActionsMenuLinkRender = (props: {
  href: string;
  children: ReactNode;
}) => ReactElement;

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
  renderLink?: RowActionsMenuLinkRender;
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
  renderLink,
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
            className={cn("flex items-center justify-center", triggerClassName)}
          >
            <IconDots
              className="size-4 shrink-0"
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
                  renderLink ? (
                    renderLink({
                      href: item.href,
                      children: (
                        <>
                          {item.icon}
                          {item.label}
                        </>
                      ),
                    })
                  ) : (
                    <a href={item.href}>
                      {item.icon}
                      {item.label}
                    </a>
                  )
                }
              />
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

export type RowActionsContextMenuItemsProps = {
  items: RowActionItem[];
  renderLink?: RowActionsMenuLinkRender;
};

export function RowActionsContextMenuItems({
  items,
  renderLink,
}: RowActionsContextMenuItemsProps) {
  return (
    <>
      {items.map((item) => (
        <Fragment key={item.key}>
          {item.separatorBefore ? <ContextMenuSeparator /> : null}
          {item.href ? (
            <ContextMenuItem
              variant={item.destructive ? "destructive" : "default"}
              render={
                renderLink ? (
                  renderLink({
                    href: item.href,
                    children: (
                      <>
                        {item.icon}
                        {item.label}
                      </>
                    ),
                  })
                ) : (
                  <a href={item.href}>
                    {item.icon}
                    {item.label}
                  </a>
                )
              }
            />
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
