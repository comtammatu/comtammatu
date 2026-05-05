import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import { ArrowRight as IconArrowRight } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
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
};

export function AppPage({
  children,
  className,
  contentClassName,
  scroll = false,
  width = "wide",
  padded = true,
}: AppPageProps) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1",
        scroll ? "no-scrollbar overflow-auto" : "overflow-visible",
        padded && "p-4",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full flex-col gap-4",
          PAGE_WIDTH_CLASSNAME[width],
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
}: AppPageHeaderProps) {
  const Heading = headingLevel;

  return (
    <header
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <div className="text-xs font-medium text-muted-foreground">
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
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </header>
  );
}

export type AppSectionProps = {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ElementType;
  iconClassName?: string;
  badge?: {
    children: ReactNode;
    variant?: BadgeProps["variant"];
  };
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  size?: "default" | "sm";
};

export function AppSection({
  title,
  description,
  icon: Icon,
  iconClassName,
  badge,
  action,
  children,
  className,
  contentClassName,
  size = "default",
}: AppSectionProps) {
  const hasHeader = Boolean(title || description || Icon || badge || action);

  return (
    <Card size={size} className={className}>
      {hasHeader ? (
        <CardHeader>
          <CardTitle className="flex min-w-0 items-center gap-2">
            {Icon ? (
              <Icon
                className={cn(
                  "size-4 shrink-0 text-muted-foreground",
                  iconClassName,
                )}
              />
            ) : null}
            <span className="min-w-0 truncate">{title}</span>
          </CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
          {badge || action ? (
            <CardAction className="flex items-center gap-2">
              {badge ? (
                <Badge variant={badge.variant ?? "secondary"}>
                  {badge.children}
                </Badge>
              ) : null}
              {action}
            </CardAction>
          ) : null}
        </CardHeader>
      ) : null}
      <CardContent
        className={cn(
          "flex min-w-0 flex-col gap-3",
          !hasHeader && "pt-0",
          contentClassName,
        )}
      >
        {children}
      </CardContent>
    </Card>
  );
}

export type AppToolbarProps = {
  children: ReactNode;
  className?: string;
};

export function AppToolbar({ children, className }: AppToolbarProps) {
  return (
    <Card size="sm" className="py-0">
      <CardContent
        className={cn("flex flex-wrap items-center gap-3 p-3", className)}
      >
        {children}
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
  icon: ElementType;
  tone?: SurfaceTone;
  ctaLabel?: string;
};

export function AppLinkCard({
  href,
  title,
  description,
  badge,
  badgeVariant = "secondary",
  icon: Icon,
  tone = "primary",
  ctaLabel = "Mở chi tiết",
}: AppLinkCardProps) {
  return (
    <Card className="h-full transition-[box-shadow,border-color] hover:shadow-sm">
      <CardContent className="h-full p-0">
        <Link
          href={href}
          className="group flex h-full flex-col justify-between gap-5 p-4"
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div
                className={cn(
                  "flex size-10 items-center justify-center rounded-md",
                  TONE_CLASSNAME[tone],
                )}
              >
                <Icon className="size-5" />
              </div>
              {badge ? <Badge variant={badgeVariant}>{badge}</Badge> : null}
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
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            {ctaLabel}
            <IconArrowRight className="size-4" />
          </span>
        </Link>
      </CardContent>
    </Card>
  );
}
