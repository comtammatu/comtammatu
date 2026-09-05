"use client";

import {
  createContext,
  useContext,
  type ComponentProps,
  type ReactNode,
} from "react";
import { cn } from "../lib/utils";
import { Frame } from "../components/frame";

export type AppInspectorGridRatio = "balanced" | "wide-main" | "compact-main";

type InspectorGridContextValue = {
  ratio: AppInspectorGridRatio;
};

const InspectorGridContext = createContext<InspectorGridContextValue>({
  ratio: "wide-main",
});

const RATIO_SPAN_MAP: Record<
  AppInspectorGridRatio,
  { main: string; sidebar: string }
> = {
  "wide-main": {
    main: "lg:col-span-7",
    sidebar: "lg:col-span-5",
  },
  balanced: {
    main: "lg:col-span-6",
    sidebar: "lg:col-span-6",
  },
  "compact-main": {
    main: "lg:col-span-8",
    sidebar: "lg:col-span-4",
  },
};

export type AppInspectorGridProps = {
  ratio?: AppInspectorGridRatio;
  children: ReactNode;
  className?: string;
};

/**
 * 2-column Inspector layout adapter for management DETAIL and inspection workflows.
 * Stacks vertically on phone/tablet and splits into Main + Sidebar on desktop.
 */
export function AppInspectorGrid({
  ratio = "wide-main",
  children,
  className,
}: AppInspectorGridProps) {
  return (
    <InspectorGridContext.Provider value={{ ratio }}>
      <div className={cn("grid grid-cols-1 gap-6 lg:grid-cols-12", className)}>
        {children}
      </div>
    </InspectorGridContext.Provider>
  );
}

export type AppInspectorMainProps = {
  children: ReactNode;
  className?: string;
};

export function AppInspectorMain({
  children,
  className,
}: AppInspectorMainProps) {
  const { ratio } = useContext(InspectorGridContext);
  const spanClass = RATIO_SPAN_MAP[ratio].main;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-5",
        spanClass,
        className,
      )}
    >
      {children}
    </div>
  );
}

export type AppInspectorSidebarProps = {
  sticky?: boolean;
  children: ReactNode;
  className?: string;
};

export function AppInspectorSidebar({
  sticky = false,
  children,
  className,
}: AppInspectorSidebarProps) {
  const { ratio } = useContext(InspectorGridContext);
  const spanClass = RATIO_SPAN_MAP[ratio].sidebar;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-4",
        sticky && "self-start lg:sticky lg:top-4",
        spanClass,
        className,
      )}
    >
      {children}
    </div>
  );
}

export type AppInspectorSectionProps = ComponentProps<typeof Frame> & {
  title?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function AppInspectorSection({
  title,
  eyebrow,
  actions,
  children,
  className,
  ...props
}: AppInspectorSectionProps) {
  const hasHeader = title != null || eyebrow != null || actions != null;

  return (
    <Frame
      className={cn("flex flex-col gap-3 bg-muted/30 p-4", className)}
      {...props}
    >
      {hasHeader ? (
        <div className="flex items-center justify-between gap-2 border-b border-border/20 pb-2">
          <div className="flex min-w-0 flex-col gap-1">
            {eyebrow ? (
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {eyebrow}
              </span>
            ) : null}
            {title ? (
              <span className="truncate text-sm font-semibold text-foreground">
                {title}
              </span>
            ) : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </Frame>
  );
}

export type AppInspectorRowProps = {
  label?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function AppInspectorRow({
  label,
  description,
  children,
  className,
}: AppInspectorRowProps) {
  return (
    <label className={cn("flex flex-col gap-1.5 text-sm", className)}>
      {label ? (
        <span className="font-medium text-muted-foreground">{label}</span>
      ) : null}
      {children}
      {description ? (
        <span className="text-xs text-muted-foreground">{description}</span>
      ) : null}
    </label>
  );
}

export const InspectorGrid = AppInspectorGrid;
export type InspectorGridProps = AppInspectorGridProps;
export const InspectorMain = AppInspectorMain;
export type InspectorMainProps = AppInspectorMainProps;
export const InspectorSidebar = AppInspectorSidebar;
export type InspectorSidebarProps = AppInspectorSidebarProps;
export const InspectorSection = AppInspectorSection;
export type InspectorSectionProps = AppInspectorSectionProps;
export const InspectorRow = AppInspectorRow;
export type InspectorRowProps = AppInspectorRowProps;
