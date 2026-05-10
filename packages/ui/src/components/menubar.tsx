"use client";

import * as React from "react";
import { Menubar as MenubarPrimitive } from "radix-ui";

import { cn } from "../lib/utils";
import {
  Check as IconCheck,
  ChevronRight as IconChevronRight,
} from "lucide-react";

const menubarContentWidthClasses = {
  default: "min-w-32",
  action: "w-56",
} as const;

const menubarItemDensityClasses = {
  compact: "min-h-7 text-xs/relaxed [&_svg:not([class*='size-'])]:size-3.5",
  default: "min-h-8 text-xs/relaxed [&_svg:not([class*='size-'])]:size-3.5",
  touch: "min-h-11 text-sm/relaxed [&_svg:not([class*='size-'])]:size-4",
} as const;

type MenubarContentWidth = keyof typeof menubarContentWidthClasses;
type MenubarContentDensity = keyof typeof menubarItemDensityClasses;

const MenubarDensityContext =
  React.createContext<MenubarContentDensity>("compact");

function Menubar({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Root>) {
  return (
    <MenubarPrimitive.Root
      data-slot="menubar"
      className={cn("flex h-9 items-center rounded-lg border p-1", className)}
      {...props}
    />
  );
}

function MenubarMenu({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Menu>) {
  return <MenubarPrimitive.Menu data-slot="menubar-menu" {...props} />;
}

function MenubarGroup({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Group>) {
  return <MenubarPrimitive.Group data-slot="menubar-group" {...props} />;
}

function MenubarPortal({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Portal>) {
  return <MenubarPrimitive.Portal data-slot="menubar-portal" {...props} />;
}

function MenubarRadioGroup({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.RadioGroup>) {
  return (
    <MenubarPrimitive.RadioGroup data-slot="menubar-radio-group" {...props} />
  );
}

function MenubarTrigger({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Trigger>) {
  return (
    <MenubarPrimitive.Trigger
      data-slot="menubar-trigger"
      className={cn(
        "flex min-h-7 items-center rounded-md px-2 text-xs/relaxed font-medium outline-hidden select-none hover:bg-muted aria-expanded:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

function MenubarContent({
  className,
  align = "start",
  alignOffset = -4,
  sideOffset = 8,
  width = "default",
  density = "compact",
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Content> & {
  width?: MenubarContentWidth;
  density?: MenubarContentDensity;
}) {
  return (
    <MenubarPortal>
      <MenubarDensityContext.Provider value={density}>
        <MenubarPrimitive.Content
          data-slot="menubar-content"
          data-density={density}
          align={align}
          alignOffset={alignOffset}
          sideOffset={sideOffset}
          className={cn(
            "z-50 origin-(--radix-menubar-content-transform-origin) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            menubarContentWidthClasses[width],
            className,
          )}
          {...props}
        />
      </MenubarDensityContext.Provider>
    </MenubarPortal>
  );
}

function MenubarItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Item> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) {
  const density = React.useContext(MenubarDensityContext);

  return (
    <MenubarPrimitive.Item
      data-slot="menubar-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "group/menubar-item relative flex cursor-default items-center gap-2 rounded-md px-2 py-1 outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7.5 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 data-[variant=destructive]:*:[svg]:text-destructive!",
        menubarItemDensityClasses[density],
        className,
      )}
      {...props}
    />
  );
}

function MenubarCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.CheckboxItem> & {
  inset?: boolean;
}) {
  const density = React.useContext(MenubarDensityContext);

  return (
    <MenubarPrimitive.CheckboxItem
      data-slot="menubar-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md py-1.5 pr-2 pl-7.5 outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7.5 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        menubarItemDensityClasses[density],
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-4 items-center justify-center [&_svg:not([class*='size-'])]:size-4">
        <MenubarPrimitive.ItemIndicator>
          <IconCheck />
        </MenubarPrimitive.ItemIndicator>
      </span>
      {children}
    </MenubarPrimitive.CheckboxItem>
  );
}

function MenubarRadioItem({
  className,
  children,
  inset,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.RadioItem> & {
  inset?: boolean;
}) {
  const density = React.useContext(MenubarDensityContext);

  return (
    <MenubarPrimitive.RadioItem
      data-slot="menubar-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md py-1.5 pr-2 pl-7.5 outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7.5 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        menubarItemDensityClasses[density],
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-4 items-center justify-center [&_svg:not([class*='size-'])]:size-4">
        <MenubarPrimitive.ItemIndicator>
          <IconCheck />
        </MenubarPrimitive.ItemIndicator>
      </span>
      {children}
    </MenubarPrimitive.RadioItem>
  );
}

function MenubarLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Label> & {
  inset?: boolean;
}) {
  return (
    <MenubarPrimitive.Label
      data-slot="menubar-label"
      data-inset={inset}
      className={cn(
        "px-2 py-1.5 text-xs text-muted-foreground data-inset:pl-7.5",
        className,
      )}
      {...props}
    />
  );
}

function MenubarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Separator>) {
  return (
    <MenubarPrimitive.Separator
      data-slot="menubar-separator"
      className={cn("-mx-1 my-1 h-px bg-border/50", className)}
      {...props}
    />
  );
}

function MenubarShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="menubar-shortcut"
      className={cn(
        "ml-auto text-3xs tracking-widest text-muted-foreground group-focus/menubar-item:text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}

function MenubarSub({
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.Sub>) {
  return <MenubarPrimitive.Sub data-slot="menubar-sub" {...props} />;
}

function MenubarSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.SubTrigger> & {
  inset?: boolean;
}) {
  const density = React.useContext(MenubarDensityContext);

  return (
    <MenubarPrimitive.SubTrigger
      data-slot="menubar-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex cursor-default items-center gap-2 rounded-md px-2 py-1 outline-none select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7.5 data-open:bg-accent data-open:text-accent-foreground [&_svg:not([class*='size-'])]:size-3.5",
        menubarItemDensityClasses[density],
        className,
      )}
      {...props}
    >
      {children}
      <IconChevronRight className="cn-rtl-flip ml-auto size-4" />
    </MenubarPrimitive.SubTrigger>
  );
}

function MenubarSubContent({
  className,
  width = "default",
  density,
  ...props
}: React.ComponentProps<typeof MenubarPrimitive.SubContent> & {
  width?: MenubarContentWidth;
  density?: MenubarContentDensity;
}) {
  const inheritedDensity = React.useContext(MenubarDensityContext);
  const resolvedDensity = density ?? inheritedDensity;

  return (
    <MenubarDensityContext.Provider value={resolvedDensity}>
      <MenubarPrimitive.SubContent
        data-slot="menubar-sub-content"
        data-density={resolvedDensity}
        className={cn(
          "z-50 origin-(--radix-menubar-content-transform-origin) overflow-hidden rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          menubarContentWidthClasses[width],
          className,
        )}
        {...props}
      />
    </MenubarDensityContext.Provider>
  );
}

export {
  Menubar,
  MenubarPortal,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarGroup,
  MenubarSeparator,
  MenubarLabel,
  MenubarItem,
  MenubarShortcut,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
};
