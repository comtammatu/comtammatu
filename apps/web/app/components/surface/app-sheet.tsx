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
import {
  OWNER_SHELL_BREAKPOINT,
  useIsMobile,
} from "@comtammatu/ui/hooks/use-mobile";

export type AppSheetSide = "top" | "right" | "bottom" | "left";

export interface AppSheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  trigger?: ReactNode;
  side?: AppSheetSide;
  size?: "md" | "lg";
  showCloseButton?: boolean;
  contentClassName?: string;
  bodyClassName?: string;
  headerClassName?: string;
  footerClassName?: string;
}

export function AppSheet({
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
  contentClassName,
  bodyClassName,
  headerClassName,
  footerClassName,
}: AppSheetProps) {
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
        showCloseButton={showCloseButton}
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
