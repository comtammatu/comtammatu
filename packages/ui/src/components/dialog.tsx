"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "../lib/utils";
import { Button } from "./button";
import { X as IconX } from "lucide-react";

const dialogContentSizeClasses = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
  "3xl": "sm:max-w-3xl",
  "5xl": "sm:max-w-5xl",
} as const;

const dialogContentPaddingClasses = {
  default: "gap-4 p-4",
  compact: "gap-3 p-3",
  none: "gap-0 p-0",
} as const;

const dialogContentScrollClasses = {
  auto: "overflow-y-auto",
  hidden: "overflow-hidden",
} as const;

const dialogContentPlacementClasses = {
  center: "top-1/2 -translate-y-1/2",
  command: "top-1/3 translate-y-0",
} as const;

const dialogFooterSpacingClasses = {
  default: "",
  form: "pt-6",
} as const;

type DialogContentSize = keyof typeof dialogContentSizeClasses;
type DialogContentPadding = keyof typeof dialogContentPaddingClasses;
type DialogContentScroll = keyof typeof dialogContentScrollClasses;
type DialogContentPlacement = keyof typeof dialogContentPlacementClasses;
type DialogFooterSpacing = keyof typeof dialogFooterSpacingClasses;

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/80 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  size = "sm",
  padding = "default",
  scroll = "auto",
  placement = "center",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  size?: DialogContentSize;
  padding?: DialogContentPadding;
  scroll?: DialogContentScroll;
  placement?: DialogContentPlacement;
  showCloseButton?: boolean;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "fixed left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] -translate-x-1/2 rounded-xl bg-popover text-xs/relaxed text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          dialogContentPlacementClasses[placement],
          dialogContentSizeClasses[size],
          dialogContentPaddingClasses[padding],
          dialogContentScrollClasses[scroll],
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-2 right-2"
              size="icon-sm"
            >
              <IconX />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1", className)}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  spacing = "default",
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  spacing?: DialogFooterSpacing;
  showCloseButton?: boolean;
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        dialogFooterSpacingClasses[spacing],
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-sm font-medium", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-xs/relaxed text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
