"use client";

import type { ComponentProps, ReactNode } from "react";
import {
  Check as IconCheck,
  CheckCircle2 as IconCheckCircle2,
  ChevronDown as IconChevronDown,
} from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Badge } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import { Item } from "@comtammatu/ui/components/item";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@comtammatu/ui/components/dropdown-menu";

export type AppBoardGridVariant = "scroll" | "grid";

export type AppBoardGridProps = {
  children: ReactNode;
  variant?: AppBoardGridVariant;
  className?: string;
};

export function AppBoardGrid({
  children,
  variant = "scroll",
  className,
}: AppBoardGridProps) {
  return (
    <div
      className={cn(
        variant === "scroll"
          ? "flex items-start gap-4 overflow-x-auto pb-4 pt-1"
          : "grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type AppBoardColumnProps = ComponentProps<typeof Frame> & {
  isDragOver?: boolean;
  children: ReactNode;
  className?: string;
};

export function AppBoardColumn({
  isDragOver = false,
  children,
  className,
  ...props
}: AppBoardColumnProps) {
  return (
    <Frame
      className={cn(
        "flex min-h-96 w-80 min-w-80 shrink-0 flex-col gap-2 bg-muted/30 p-3 shadow-2xs transition-colors",
        isDragOver && "bg-primary/10 ring-2 ring-primary/20",
        className,
      )}
      {...props}
    >
      {children}
    </Frame>
  );
}

export type AppBoardColumnHeaderProps = {
  title: ReactNode;
  count?: number;
  indicatorColor?: string;
  actions?: ReactNode;
  className?: string;
};

export function AppBoardColumnHeader({
  title,
  count,
  indicatorColor = "bg-primary",
  actions,
  className,
}: AppBoardColumnHeaderProps) {
  return (
    <header
      className={cn(
        "flex items-center justify-between gap-2 border-b border-border/30 px-1 pb-2",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className={cn("size-2 shrink-0 rounded-full", indicatorColor)} />
        <h3 className="truncate text-sm font-semibold text-foreground">
          {title}
        </h3>
      </div>
      <div className="flex items-center gap-1.5">
        {count != null ? (
          <Badge
            variant={count > 0 ? "secondary" : "outline"}
            className="px-2 font-mono text-xs tabular-nums"
          >
            {count}
          </Badge>
        ) : null}
        {actions}
      </div>
    </header>
  );
}

export type AppBoardCardProps = ComponentProps<typeof Item> & {
  isDragging?: boolean;
  children: ReactNode;
  className?: string;
};

export function AppBoardCard({
  isDragging = false,
  children,
  className,
  ...props
}: AppBoardCardProps) {
  return (
    <Item
      variant="outline"
      className={cn(
        "cursor-pointer border-border/50 bg-card p-3 shadow-2xs transition-colors hover:border-primary/20",
        isDragging && "border-dashed opacity-40",
        className,
      )}
      {...props}
    >
      {children}
    </Item>
  );
}

export type AppBoardStatusOption = {
  value: string;
  label: string;
  dotClass?: string;
};

export type AppBoardStatusDropdownProps = {
  status: string;
  statusLabel?: string;
  dotClass?: string;
  options: AppBoardStatusOption[];
  onStatusChange: (nextStatus: string) => void;
  disabled?: boolean;
  className?: string;
};

export function AppBoardStatusDropdown({
  status,
  statusLabel,
  dotClass = "bg-muted-foreground",
  options,
  onStatusChange,
  disabled = false,
  className,
}: AppBoardStatusDropdownProps) {
  const currentLabel =
    statusLabel ?? options.find((opt) => opt.value === status)?.label ?? status;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={(event) => event.stopPropagation()}
            className={cn("h-6 gap-1 px-2 text-2xs font-medium", className)}
          >
            <span className={cn("size-1.5 rounded-full", dotClass)} />
            <span>{currentLabel}</span>
            <IconChevronDown className="size-2.5 opacity-60" />
          </Button>
        }
      />
      <DropdownMenuContent align="start" className="w-auto min-w-36">
        {options.map((option) => {
          const active = option.value === status;
          return (
            <DropdownMenuItem
              key={option.value}
              onClick={(event) => {
                event.stopPropagation();
                onStatusChange(option.value);
              }}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    option.dotClass ?? "bg-muted-foreground",
                  )}
                />
                <span
                  className={active ? "font-semibold text-foreground" : undefined}
                >
                  {option.label}
                </span>
              </span>
              {active ? <IconCheck className="size-3 text-primary" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export type AppBoardCompletedSectionProps = {
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  label?: string;
  children: ReactNode;
  className?: string;
};

export function AppBoardCompletedSection({
  count,
  isExpanded,
  onToggle,
  label = "Đã hoàn thành",
  children,
  className,
}: AppBoardCompletedSectionProps) {
  if (count <= 0) return null;

  return (
    <div className={cn("mt-2 border-t border-border/30 pt-1.5", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className="h-7 w-full justify-between px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          <IconCheckCircle2 className="size-3.5 text-success" />
          <span>
            {label} ({count})
          </span>
        </span>
        <IconChevronDown
          className={cn(
            "size-3.5 transition-transform duration-200",
            isExpanded && "rotate-180",
          )}
        />
      </Button>
      {isExpanded ? (
        <div className="mt-2 flex flex-col gap-2 opacity-85">{children}</div>
      ) : null}
    </div>
  );
}

export type AppBoardColumnActionProps = ComponentProps<typeof Button>;

export function AppBoardColumnAction({
  children,
  className,
  ...props
}: AppBoardColumnActionProps) {
  return (
    <div className="mt-auto border-t border-border/20 pt-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "w-full justify-center gap-1.5 border border-dashed border-border/60 text-xs text-muted-foreground hover:border-primary/20 hover:bg-background hover:text-foreground",
          className,
        )}
        {...props}
      >
        {children}
      </Button>
    </div>
  );
}
