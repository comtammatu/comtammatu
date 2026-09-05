"use client";

import { isValidElement, type ReactElement, type ReactNode } from "react";
import { cn } from "../lib/utils";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "../components/drawer";

export interface AppDrawerProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  trigger?: ReactNode;
  contentClassName?: string;
  bodyClassName?: string;
  headerClassName?: string;
  footerClassName?: string;
}

export function AppDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  trigger,
  contentClassName,
  bodyClassName,
  headerClassName,
  footerClassName,
}: AppDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {trigger
        ? isValidElement(trigger)
          ? <DrawerTrigger render={trigger as ReactElement} />
          : trigger
        : null}
      <DrawerContent className={contentClassName}>
        <DrawerHeader className={headerClassName}>
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription className={description ? undefined : "sr-only"}>
            {description ?? title}
          </DrawerDescription>
        </DrawerHeader>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3",
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer ? (
          <DrawerFooter className={footerClassName}>{footer}</DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
};

export const DrawerFrame = AppDrawer;
export type DrawerFrameProps = AppDrawerProps;
