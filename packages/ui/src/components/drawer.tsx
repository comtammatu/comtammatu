"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { cn } from "../lib/utils";

const drawerContentSizeClasses = {
  sm: "data-[vaul-drawer-direction=left]:sm:max-w-sm data-[vaul-drawer-direction=right]:sm:max-w-sm",
  md: "data-[vaul-drawer-direction=left]:sm:max-w-md data-[vaul-drawer-direction=right]:sm:max-w-md",
  lg: "max-w-md data-[vaul-drawer-direction=left]:sm:max-w-lg data-[vaul-drawer-direction=right]:sm:max-w-lg sm:max-w-lg",
  full: "",
} as const;

const drawerContentHeightClasses = {
  auto: "data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh]",
  screen:
    "h-dvh max-h-dvh data-[vaul-drawer-direction=bottom]:top-0 data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-dvh",
  desktopScreen:
    "h-dvh max-h-dvh data-[vaul-drawer-direction=bottom]:top-0 data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:max-h-dvh sm:h-5/6",
} as const;

const drawerContentSurfaceClasses = {
  popover:
    "p-2 before:inset-2 before:rounded-xl before:border before:border-border before:bg-popover",
  background:
    "before:inset-0 before:rounded-none before:border-0 before:bg-background",
  responsive:
    "before:inset-0 before:rounded-none before:border-0 before:bg-background sm:p-2 sm:before:inset-2 sm:before:rounded-lg sm:before:border sm:before:bg-popover",
} as const;

type DrawerContentSize = keyof typeof drawerContentSizeClasses;
type DrawerContentHeight = keyof typeof drawerContentHeightClasses;
type DrawerContentSurface = keyof typeof drawerContentSurfaceClasses;

function Drawer({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/80 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  size = "sm",
  height = "auto",
  surface = "popover",
  showHandle = true,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content> & {
  size?: DrawerContentSize;
  height?: DrawerContentHeight;
  surface?: DrawerContentSurface;
  showHandle?: boolean;
}) {
  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          "group/drawer-content fixed z-50 flex h-auto flex-col bg-transparent p-0 text-xs/relaxed text-popover-foreground before:absolute before:-z-10 data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0",
          drawerContentSizeClasses[size],
          drawerContentHeightClasses[height],
          drawerContentSurfaceClasses[surface],
          className,
        )}
        {...props}
      >
        {showHandle && (
          <div className="mx-auto mt-4 hidden h-1.5 w-[100px] shrink-0 rounded-full bg-muted group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
        )}
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex flex-col gap-1 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:text-left",
        className,
      )}
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn(
        "font-heading text-sm font-medium text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-xs/relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
