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
  triggerClassName?: string;
  triggerLabel?: ReactNode;
};

export function RowActionsMenu({
  items,
  label = "Thao tác",
  align = "end",
  triggerSize = "icon-lg",
  triggerClassName,
  triggerLabel,
}: RowActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={triggerSize} className={triggerClassName}>
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
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {items.map((item) => (
          <Fragment key={item.key}>
            {item.separatorBefore ? <DropdownMenuSeparator /> : null}
            {item.href ? (
              <DropdownMenuItem
                variant={item.destructive ? "destructive" : "default"}
                asChild
              >
                <Link href={item.href}>
                  {item.icon}
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                disabled={item.disabled}
                variant={item.destructive ? "destructive" : "default"}
                onSelect={() => item.onSelect?.()}
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
