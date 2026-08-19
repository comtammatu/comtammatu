"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";

import { cn } from "../lib/utils";

type DrawerProps = Omit<
  React.ComponentProps<typeof DrawerPrimitive.Root>,
  "children"
> & {
  children?: React.ReactNode;
};

function Drawer({ ...props }: DrawerProps) {
  return <DrawerPrimitive.Root {...props} />;
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal {...props} />;
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Backdrop>) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-50 drawer-scrim transition-opacity duration-[var(--motion-fast)] ease-[var(--ease-move)] data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:pointer-events-none",
        className,
      )}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  showHandle = true,
  responsiveFullscreen = false,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Popup> & {
  showHandle?: boolean;
  responsiveFullscreen?: boolean;
}) {
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Viewport className="fixed inset-0 z-50">
        <DrawerPrimitive.Popup
          data-slot="drawer-content"
          className={cn(
            "group/drawer-content fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-dvh-80 flex-col overflow-hidden overscroll-contain bg-transparent p-2 text-xs/relaxed text-popover-foreground before:pointer-events-none before:absolute before:inset-2 before:bottom-0 before:-z-10 before:rounded-t-lg before:rounded-b-none before:border before:border-border before:bg-popover before:shadow-effect-drawer transition-[opacity,transform] duration-[var(--motion-drawer)] ease-[var(--ease-move)] data-[starting-style]:translate-y-full data-[starting-style]:opacity-0 data-[ending-style]:translate-y-full data-[ending-style]:opacity-0 data-[ending-style]:pointer-events-none",
            responsiveFullscreen &&
              "mt-0 h-dvh max-h-dvh p-0 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] before:inset-0 before:rounded-none before:border-0 before:bg-background sm:h-5/6 sm:p-2 sm:before:inset-2 sm:before:rounded-t-lg sm:before:rounded-b-none sm:before:border sm:before:bg-popover",
            className,
          )}
          {...props}
        >
          <DrawerPrimitive.Content className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {showHandle && (
              <div className="mx-auto mt-4 h-1.5 w-25 shrink-0 rounded-full bg-muted" />
            )}
            {children}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "flex flex-col gap-1 p-4 text-center md:text-left",
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
