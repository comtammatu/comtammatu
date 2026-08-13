"use client";

import { isValidElement, type ReactElement, type ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@comtammatu/ui/components/sheet";

export type StationSheetSide = "top" | "right" | "bottom" | "left";

export interface StationSheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  trigger?: ReactNode;
  side?: StationSheetSide;
  size?: "md" | "lg";
  showCloseButton?: boolean;
  fullscreen?: boolean;
  contentClassName?: string;
  bodyClassName?: string;
  headerClassName?: string;
  footerClassName?: string;
}

export function StationSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  trigger,
  side = "bottom",
  size = "lg",
  showCloseButton = true,
  fullscreen = false,
  contentClassName,
  bodyClassName,
  headerClassName,
  footerClassName,
}: StationSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger
        ? isValidElement(trigger)
          ? <SheetTrigger render={trigger as ReactElement} />
          : trigger
        : null}
      <SheetContent
        side={side}
        size={size}
        fullscreen={fullscreen}
        showCloseButton={showCloseButton}
        closeButtonSize="icon-touch"
        className={contentClassName}
      >
        <SheetHeader className={headerClassName}>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className={description ? undefined : "sr-only"}>
            {description ?? title}
          </SheetDescription>
        </SheetHeader>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer ? (
          <SheetFooter className={footerClassName}>{footer}</SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
};
