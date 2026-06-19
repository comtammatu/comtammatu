"use client";

import { Fragment, type ComponentProps, type ReactNode } from "react";
import {
  Ellipsis as IconDots,
  RotateCcw as IconRotate,
  Trash as IconTrash,
} from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { Button } from "@comtammatu/ui/components/button";
import { confirm } from "@comtammatu/ui/components/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";

export interface RowActionsMenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  href?: never;
  destructive?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

interface RowActionsMenuProps {
  items: RowActionsMenuItem[];
  align?: "start" | "center" | "end";
  label?: string;
}

export function RowActionsMenu({
  items,
  align = "end",
  label = "Menu",
}: RowActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-lg">
          <IconDots className="size-4" />
          <span className="sr-only">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {items.map((item, index) => (
          <Fragment key={index}>
            {item.separatorBefore ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              disabled={item.disabled}
              className={item.destructive ? "text-destructive" : undefined}
              onClick={item.onSelect}
            >
              {item.icon}
              {item.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface InlineRetryActionProps {
  onRetry: () => void;
  disabled?: boolean;
  label?: ReactNode;
}

export function InlineRetryAction({
  onRetry,
  disabled,
  label = ACTIONS_VI.retry,
}: InlineRetryActionProps) {
  return (
    <Button size="sm" variant="outline" disabled={disabled} onClick={onRetry}>
      <IconRotate className="size-3.5" />
      {label}
    </Button>
  );
}

interface DestructiveConfirmActionProps {
  title: string;
  description?: string;
  details?: Array<{ label: string; value: string }>;
  onConfirm: () => void | Promise<void>;
  children?: ReactNode;
  buttonProps?: Omit<
    ComponentProps<typeof Button>,
    "variant" | "onClick" | "children"
  >;
}

export function DestructiveConfirmAction({
  title,
  description,
  details,
  onConfirm,
  children = ACTIONS_VI.delete,
  buttonProps,
}: DestructiveConfirmActionProps) {
  return (
    <Button
      variant="destructive"
      {...buttonProps}
      onClick={async () => {
        const ok = await confirm({
          title,
          description,
          details,
          confirmText:
            typeof children === "string" ? children : ACTIONS_VI.delete,
          variant: "destructive",
        });
        if (ok) await onConfirm();
      }}
    >
      <IconTrash className="size-3.5" />
      {children}
    </Button>
  );
}
