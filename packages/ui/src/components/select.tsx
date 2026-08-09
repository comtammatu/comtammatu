"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";

import { cn } from "../lib/utils";
import { fieldTriggerChrome } from "../lib/field-trigger";
import {
  FLOATING_POSITION_METHOD,
  floatingCollisionBoundary,
} from "../lib/floating-layer";
import {
  Check as IconCheck,
  ChevronDown as IconChevronDown,
  ChevronUp as IconChevronUp,
} from "lucide-react";

type SelectProps = Omit<SelectPrimitive.Root.Props<string>, "onValueChange"> & {
  onValueChange?: (value: string) => void;
};

function collectSelectItems(children: React.ReactNode) {
  const items: { label: React.ReactNode; value: string }[] = [];

  React.Children.forEach(children, (child) => {
    if (
      !React.isValidElement<{ children?: React.ReactNode; value?: unknown }>(
        child,
      )
    ) {
      return;
    }

    if (child.type === SelectItem && typeof child.props.value === "string") {
      items.push({ label: child.props.children, value: child.props.value });
      return;
    }

    items.push(...collectSelectItems(child.props.children));
  });

  return items;
}

function Select({ children, items, onValueChange, ...props }: SelectProps) {
  return (
    <SelectPrimitive.Root
      {...props}
      items={items ?? collectSelectItems(children)}
      onValueChange={(value) => {
        if (typeof value === "string") {
          onValueChange?.(value);
        }
      }}
    >
      {children}
    </SelectPrimitive.Root>
  );
}

function SelectGroup({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1 p-1", className)}
      {...props}
    />
  );
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default" | "field" | "touch";
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 px-2 py-1.5 text-xs/relaxed whitespace-nowrap data-[size=default]:h-7 data-[size=sm]:h-6 data-[size=field]:h-10 data-[size=field]:px-3 data-[size=field]:text-sm data-[size=touch]:min-h-12 data-[size=touch]:px-3 data-[size=touch]:text-sm *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        fieldTriggerChrome,
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <IconChevronDown className="pointer-events-none size-3.5 text-muted-foreground" />
        }
      />
    </SelectPrimitive.Trigger>
  );
}

type SelectContentProps = Omit<
  React.ComponentProps<typeof SelectPrimitive.Positioner>,
  "children" | "className"
> & {
  children?: React.ReactNode;
  className?: string;
  position?: "item-aligned" | "popper";
};

function SelectContent({
  className,
  children,
  position = "popper",
  align = "start",
  positionMethod = FLOATING_POSITION_METHOD,
  // LIST toolbars sit inside Card overflow; clipping-ancestors flips into search.
  collisionBoundary = floatingCollisionBoundary(),
  ...props
}: SelectContentProps) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        align={align}
        alignItemWithTrigger={position === "item-aligned"}
        positionMethod={positionMethod}
        collisionBoundary={collisionBoundary}
        className="isolate z-50"
        {...props}
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          data-align-trigger={position === "item-aligned"}
          className={cn(
            "relative z-50 max-h-(--available-height) min-w-32 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-effect-popover transition-[opacity,transform] duration-[var(--motion-fast)] ease-[var(--ease-move)] data-[align-trigger=true]:transition-none data-[starting-style]:scale-95 data-[starting-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[align-trigger=true]:data-[starting-style]:scale-100 data-[align-trigger=true]:data-[starting-style]:opacity-100 data-[align-trigger=true]:data-[ending-style]:scale-100 data-[align-trigger=true]:data-[ending-style]:opacity-100",
            position === "popper" &&
              "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
            className,
          )}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List
            data-position={position}
            className={cn(
              "data-[position=popper]:w-full data-[position=popper]:min-w-(--anchor-width)",
            )}
          >
            {children}
          </SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.GroupLabel>) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

function SelectItem({
  className,
  children,
  size = "default",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item> & {
  size?: "default" | "touch";
}) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      data-size={size}
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1 pr-8 text-xs/relaxed outline-hidden select-none data-[size=default]:min-h-7 data-[size=touch]:min-h-12 data-[size=touch]:text-sm data-highlighted:bg-accent data-highlighted:text-accent-foreground not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute right-2 flex items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <IconCheck className="pointer-events-none" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

function SelectSeparator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="separator"
      data-slot="select-separator"
      className={cn(
        "pointer-events-none -mx-1 my-1 h-px bg-border/50",
        className,
      )}
      {...props}
    />
  );
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up-button"
      className={cn(
        "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    >
      <IconChevronUp />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down-button"
      className={cn(
        "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    >
      <IconChevronDown />
    </SelectPrimitive.ScrollDownArrow>
  );
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
