"use client";

import { isValidElement, type ReactElement, type ReactNode } from "react";
import { cn } from "../lib/utils";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../components/sheet";
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "../hooks/use-mobile";
import type { SheetSide } from "./types";

export type { SheetSide };
export type AppSheetSide = SheetSide;
export type StationSheetSide = SheetSide;

export interface SheetFrameProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  trigger?: ReactNode;
  side?: SheetSide;
  size?: "md" | "lg";
  showCloseButton?: boolean;
  closeButtonSize?: "icon-sm" | "icon-touch";
  fullscreen?: boolean;
  contentClassName?: string;
  bodyClassName?: string;
  headerClassName?: string;
  footerClassName?: string;
}

export type AppSheetProps = SheetFrameProps;
export type StationSheetProps = SheetFrameProps;

export function SheetFrame({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  trigger,
  side,
  size = "lg",
  showCloseButton = true,
  closeButtonSize,
  fullscreen = false,
  contentClassName,
  bodyClassName,
  headerClassName,
  footerClassName,
}: SheetFrameProps) {
  const isTouchLayout = useIsMobile(OWNER_SHELL_BREAKPOINT);
  const resolvedSide = side ?? (isTouchLayout ? "bottom" : "right");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger
        ? isValidElement(trigger)
          ? <SheetTrigger render={trigger as ReactElement} />
          : trigger
        : null}
      <SheetContent
        side={resolvedSide}
        size={size}
        fullscreen={fullscreen}
        showCloseButton={showCloseButton}
        closeButtonSize={closeButtonSize}
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

export const AppSheet = SheetFrame;

export function StationSheet({
  side = "bottom",
  ...props
}: SheetFrameProps) {
  return (
    <SheetFrame
      side={side}
      closeButtonSize="icon-touch"
      {...props}
    />
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
