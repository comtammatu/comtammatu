"use client";

import * as React from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";

import { cn } from "../lib/utils";
import { OWNER_SHELL_BREAKPOINT, useIsMobile } from "../hooks/use-mobile";
import { Button } from "./button";
import { X as IconX } from "lucide-react";

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root {...props} />;
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Backdrop>) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-effect-scrim transition-opacity duration-[var(--motion-fast)] ease-[var(--ease-move)] supports-backdrop-filter:backdrop-blur-sm data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
        className,
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  size = "lg",
  showCloseButton = true,
  fullscreen = false,
  closeButtonSize,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Popup> & {
  side?: "top" | "right" | "bottom" | "left";
  size?: "md" | "lg";
  showCloseButton?: boolean;
  /** Fill the dynamic viewport for top and bottom sheets. */
  fullscreen?: boolean;
  /** Station sheets pass `icon-touch`; control_surface keeps the 1024px split. */
  closeButtonSize?: "icon-sm" | "icon-touch";
}) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        data-size={size}
        data-close-button={showCloseButton ? "true" : "false"}
        data-fullscreen={fullscreen ? "true" : "false"}
        className={cn(
          "group/sheet fixed z-50 flex flex-col overscroll-contain bg-popover bg-clip-padding text-xs/relaxed text-popover-foreground shadow-effect-drawer transition-[opacity,transform] duration-[var(--motion-drawer)] ease-[var(--ease-move)] data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-full data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-full data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:border-b data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[side=bottom]:data-[starting-style]:translate-y-full data-[side=bottom]:data-[ending-style]:translate-y-full data-[side=left]:data-[starting-style]:-translate-x-full data-[side=left]:data-[ending-style]:-translate-x-full data-[side=right]:data-[starting-style]:translate-x-full data-[side=right]:data-[ending-style]:translate-x-full data-[side=top]:data-[starting-style]:-translate-y-full data-[side=top]:data-[ending-style]:-translate-y-full",
          fullscreen
            ? "data-[side=bottom]:h-dvh data-[side=bottom]:max-h-dvh data-[side=top]:h-dvh data-[side=top]:max-h-dvh"
            : "data-[side=bottom]:h-auto data-[side=bottom]:max-h-dvh-95 data-[side=top]:h-auto data-[side=top]:max-h-dvh-95",
          size === "md"
            ? "data-[side=left]:sm:max-w-md data-[side=right]:sm:max-w-md"
            : "data-[side=left]:sm:max-w-lg data-[side=right]:sm:max-w-lg",
          "data-[side=bottom]:pb-[env(safe-area-inset-bottom)] data-[side=left]:pt-[env(safe-area-inset-top)] data-[side=left]:pb-[env(safe-area-inset-bottom)] data-[side=right]:pt-[env(safe-area-inset-top)] data-[side=right]:pb-[env(safe-area-inset-bottom)] data-[side=top]:pt-[env(safe-area-inset-top)]",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                // Absolute close ignores SheetContent padding, so offset by the
                // notch inset only — never floor at 0.5rem (that drops the X
                // below SheetTitle on desktop / zero-inset devices).
                className="absolute top-[env(safe-area-inset-top,0px)] right-2"
                size={
                  closeButtonSize ??
                  (isTouchLayout ? "icon-touch" : "icon-sm")
                }
              >
                <IconX />
                <span className="sr-only">Close</span>
              </Button>
            }
          />
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        // Reserve pr-16 only when the absolute default close is mounted.
        // Inline SheetClose + showCloseButton={false} must keep symmetric px
        // or the X sits in a dead gap (cart-sheet / item-customizer).
        "flex flex-col gap-1 border-b border-border/60 bg-gradient-to-b from-secondary/20 to-card px-3 py-2.5 text-left sm:px-4 group-data-[close-button=true]/sheet:pr-16",
        className,
      )}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "mt-auto flex flex-col gap-2 border-t border-border/60 px-3 py-3 sm:px-4",
        className,
      )}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-semibold text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-xs/relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
