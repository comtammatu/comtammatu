"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowRight as IconArrowRight, ChevronDown as IconChevronDown } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@comtammatu/ui/components/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Separator } from "@comtammatu/ui/components/separator";

type SurfaceWidth = "narrow" | "default" | "wide" | "full";
type SurfaceTone = "primary" | "success" | "warning" | "info" | "secondary";

const PAGE_WIDTH_CLASSNAME: Record<SurfaceWidth, string> = {
  narrow: "max-w-xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
  full: "max-w-none",
};

const TONE_CLASSNAME: Record<SurfaceTone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  secondary: "bg-secondary text-secondary-foreground",
};

export type AppPageProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  scroll?: boolean;
  width?: SurfaceWidth;
  padded?: boolean;
  density?: "comfortable" | "compact";
  mobile?: boolean;
};

export function AppPage({
  children,
  className,
  contentClassName,
  scroll = false,
  width = "wide",
  padded = true,
  density = "comfortable",
  mobile = false,
}: AppPageProps) {
  const isCompact = density === "compact";
  return (
    <div
      className={cn(
        "min-h-0 flex-1",
        scroll ? "no-scrollbar overflow-auto" : "overflow-visible",
        padded && (isCompact ? "p-3" : "p-4"),
        mobile && "pb-28",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full flex-col",
          isCompact ? "gap-3" : "gap-4",
          mobile ? "max-w-2xl" : PAGE_WIDTH_CLASSNAME[width],
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export type AppPageHeaderProps = {
  title: ReactNode;
  headingLevel?: "h1" | "h2";
  eyebrow?: ReactNode;
  description?: ReactNode;
  badge?: {
    children: ReactNode;
    variant?: BadgeProps["variant"];
  };
  actions?: ReactNode;
  className?: string;
  titleClassName?: string;
  breadcrumb?: ReactNode;
  tabs?: ReactNode;
  meta?: ReactNode;
};

export function AppPageHeader({
  title,
  headingLevel = "h1",
  eyebrow,
  description,
  badge,
  actions,
  className,
  titleClassName,
  breadcrumb,
  tabs,
  meta,
}: AppPageHeaderProps) {
  const Heading = headingLevel;

  return (
    <header className={cn("flex flex-col gap-2", className)}>
      {breadcrumb ? <div>{breadcrumb}</div> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          {eyebrow ? (
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {eyebrow}
            </div>
          ) : null}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Heading
              className={cn(
                "font-heading min-w-0 text-xl font-semibold tracking-tight sm:text-2xl",
                titleClassName,
              )}
            >
              {title}
            </Heading>
            {badge ? (
              <Badge variant={badge.variant ?? "secondary"}>{badge.children}</Badge>
            ) : null}
          </div>
          {description ? (
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
          {meta ? (
            <div className="text-xs text-muted-foreground">{meta}</div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {tabs ? <div>{tabs}</div> : null}
    </header>
  );
}

type AppSectionTone = "default" | "info" | "warning" | "destructive";

const SECTION_TONE_CLASSNAME: Record<AppSectionTone, string> = {
  default: "",
  info: "border-info/40 bg-info/5",
  warning: "border-warning/40 bg-warning/5",
  destructive: "border-destructive/40 bg-destructive/5",
};

const SECTION_TONE_ICON_CLASSNAME: Record<AppSectionTone, string> = {
  default: "text-muted-foreground",
  info: "text-info",
  warning: "text-warning",
  destructive: "text-destructive",
};

export type AppSectionProps = {
  title?: ReactNode;
  description?: ReactNode;
  /**
   * Right-aligned muted hint text shown next to the title on sm: viewport,
   * stacked below on mobile. Use for short instructional copy that belongs
   * with the section header but is not a description (e.g. "Cập nhật số
   * lượng thực nhận" on a receive line list). For action buttons, use
   * `action` instead.
   */
  headerHint?: ReactNode;
  icon?: ReactNode;
  iconClassName?: string;
  badge?: {
    children: ReactNode;
    variant?: BadgeProps["variant"];
  };
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * Pass-through className to CardContent. Use `"p-0"` for table-edge
   * alignment when embedding `<Table>` directly. The default content layout
   * is `flex min-w-0 flex-col gap-3` — overriding via this prop is supported.
   */
  contentClassName?: string;
  size?: "default" | "sm";
  tone?: AppSectionTone;
  collapsible?: boolean;
  footer?: ReactNode;
};

export function AppSection({
  title,
  description,
  headerHint,
  icon,
  iconClassName,
  badge,
  action,
  children,
  className,
  contentClassName,
  size = "default",
  tone = "default",
  collapsible = false,
  footer,
}: AppSectionProps) {
  const [open, setOpen] = useState(true);
  const hasHeader = Boolean(title || description || headerHint || icon || badge || action || collapsible);
  const chevronAction = collapsible ? (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="text-muted-foreground hover:text-foreground transition-colors"
      aria-expanded={open}
      aria-label={open ? "Thu gọn" : "Mở rộng"}
    >
      <IconChevronDown
        className={cn("size-4 transition-transform", open ? "rotate-0" : "-rotate-90")}
      />
    </button>
  ) : null;

  return (
    <Card size={size} className={cn(SECTION_TONE_CLASSNAME[tone], className)}>
      {hasHeader ? (
        <CardHeader>
          <CardTitle
            className={cn(
              "flex min-w-0 items-center gap-2",
              headerHint && "flex-col items-start sm:flex-row sm:items-center",
            )}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              {icon ? (
                <span
                  className={cn(
                    "inline-flex shrink-0 [&_svg]:size-5",
                    SECTION_TONE_ICON_CLASSNAME[tone],
                    iconClassName,
                  )}
                >
                  {icon}
                </span>
              ) : null}
              <span className="min-w-0 truncate">{title}</span>
            </span>
            {headerHint ? (
              <span className="shrink-0 text-xs font-medium text-muted-foreground sm:text-right">
                {headerHint}
              </span>
            ) : null}
          </CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
          {badge || action || chevronAction ? (
            <CardAction className="flex items-center gap-2">
              {badge ? (
                <Badge variant={badge.variant ?? "secondary"}>
                  {badge.children}
                </Badge>
              ) : null}
              {action}
              {chevronAction}
            </CardAction>
          ) : null}
        </CardHeader>
      ) : null}
      {open ? (
        <CardContent
          className={cn(
            "flex min-w-0 flex-col gap-3",
            !hasHeader && "pt-0",
            contentClassName,
          )}
        >
          {children}
        </CardContent>
      ) : null}
      {open && footer ? (
        <CardFooter className="flex items-center justify-end gap-2 border-t px-6 py-3">
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  );
}

export type AppToolbarProps = {
  children?: ReactNode;
  className?: string;
  search?: ReactNode;
  filters?: ReactNode;
  bulk?: ReactNode;
  actions?: ReactNode;
  reset?: ReactNode;
};

export function AppToolbar({
  children,
  className,
  search,
  filters,
  bulk,
  actions,
  reset,
}: AppToolbarProps) {
  const hasSlots = search != null || filters != null || bulk != null || actions != null || reset != null;

  return (
    <Card size="sm" className="py-0">
      <CardContent
        className={cn("flex flex-wrap items-center gap-3 p-3", className)}
      >
        {hasSlots ? (
          <>
            {search ? (
              <div className="flex flex-wrap items-center gap-2">{search}</div>
            ) : null}
            {filters ? (
              <div className="flex flex-wrap items-center gap-2">{filters}</div>
            ) : null}
            {bulk ? (
              <>
                <Separator orientation="vertical" className="h-6" />
                <div className="flex flex-wrap items-center gap-2">{bulk}</div>
              </>
            ) : null}
            {actions ? (
              <>
                <Separator orientation="vertical" className="h-6" />
                <div className="flex flex-wrap items-center gap-2">{actions}</div>
              </>
            ) : null}
            {reset ? (
              <div className="flex flex-wrap items-center gap-2">{reset}</div>
            ) : null}
          </>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export type AppEmptyStateMode =
  | "no-data"
  | "no-results"
  | "no-access"
  | "error";

const EMPTY_STATE_COPY: Record<AppEmptyStateMode, string> = {
  "no-data": "Chưa có dữ liệu",
  "no-results": "Không có kết quả phù hợp",
  "no-access": "Không có quyền truy cập",
  error: "Không thể tải dữ liệu",
};

export type AppEmptyStateProps = {
  title?: string;
  mode?: AppEmptyStateMode;
  description?: string;
  icon?: ReactNode;
  iconClassName?: string;
  children?: ReactNode;
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  compact?: boolean;
  align?: "center" | "start";
};

export function AppEmptyState({
  title,
  mode = "no-data",
  description,
  icon,
  iconClassName,
  children,
  className,
  titleClassName,
  descriptionClassName,
  compact = false,
  align = "center",
}: AppEmptyStateProps) {
  return (
    <Empty
      className={cn(
        "border bg-card",
        compact ? "py-6" : "py-12",
        align === "start" && "items-start text-left",
        className,
      )}
    >
      {icon ? (
        <EmptyMedia variant="icon" className={iconClassName}>
          {icon}
        </EmptyMedia>
      ) : null}
      <EmptyHeader className={cn(align === "start" && "items-start text-left")}>
        <EmptyTitle className={titleClassName}>
          {title ?? EMPTY_STATE_COPY[mode]}
        </EmptyTitle>
        {description ? (
          <EmptyDescription
            className={cn(
              "max-w-md",
              align === "start" && "text-left",
              descriptionClassName,
            )}
          >
            {description}
          </EmptyDescription>
        ) : null}
      </EmptyHeader>
      {children ? (
        <EmptyContent
          className={cn(
            "flex-row flex-wrap justify-center",
            align === "start" && "justify-start",
          )}
        >
          {children}
        </EmptyContent>
      ) : null}
    </Empty>
  );
}

export type AppLinkCardProps = {
  href: string;
  title: string;
  description?: string;
  badge?: string;
  badgeVariant?: BadgeProps["variant"];
  icon: ReactNode;
  tone?: SurfaceTone;
  ctaLabel?: string;
  disabled?: boolean;
  disabledReason?: string;
  metric?: { value: ReactNode; label?: string };
};

export function AppLinkCard({
  href,
  title,
  description,
  badge,
  badgeVariant = "secondary",
  icon,
  tone = "primary",
  ctaLabel = "Mở chi tiết",
  disabled = false,
  disabledReason,
  metric,
}: AppLinkCardProps) {
  const topRight = (
    <div className="flex flex-col items-end gap-1">
      {badge ? <Badge variant={badgeVariant}>{badge}</Badge> : null}
      {metric ? (
        <div className="flex flex-col items-end">
          <span className="font-mono text-sm font-semibold tabular-nums">
            {metric.value}
          </span>
          {metric.label ? (
            <span className="text-xs text-muted-foreground">{metric.label}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const inner = (
    <div className="group flex h-full flex-col justify-between gap-5 p-4">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-md",
              TONE_CLASSNAME[tone],
            )}
          >
            <span className="inline-flex shrink-0 [&_svg]:size-5">{icon}</span>
          </div>
          {(badge ?? metric) ? topRight : null}
        </div>
        <div className="min-w-0">
          <p className="font-heading text-base font-semibold tracking-tight">
            {title}
          </p>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
          {disabled && disabledReason ? (
            <p className="mt-1 text-xs text-muted-foreground">{disabledReason}</p>
          ) : null}
        </div>
      </div>
      {!disabled ? (
        <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
          {ctaLabel}
          <IconArrowRight className="size-4" />
        </span>
      ) : null}
    </div>
  );

  return (
    <Card
      className={cn(
        "h-full transition-[box-shadow,border-color]",
        disabled ? "cursor-not-allowed opacity-60" : "hover:shadow-sm",
      )}
    >
      <CardContent className="h-full p-0">
        {disabled ? (
          <div aria-disabled="true" className="h-full">
            {inner}
          </div>
        ) : (
          <Link href={href} className="h-full">
            {inner}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

export type AppDetailFooterProps = {
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
};

export function AppDetailFooter({
  leading,
  trailing,
  className,
}: AppDetailFooterProps) {
  return (
    <footer
      className={cn(
        "flex flex-col gap-3 border-t border-border py-6 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {leading}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {trailing}
      </div>
    </footer>
  );
}
