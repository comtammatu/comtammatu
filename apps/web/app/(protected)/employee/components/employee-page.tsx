import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import {
  ChevronRight as IconChevronRight,
  UserCircle as IconUserCircle,
} from "lucide-react";
import { AppPageHeader, AppSection } from "@/components/surface";
import { cn } from "@comtammatu/ui";
import type { BadgeProps } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
import {
  Progress,
  type ProgressTone,
} from "@comtammatu/ui/components/progress";
import { messages } from "@lib/messages";

type EmployeeTone = "default" | "success" | "warning" | "info" | "destructive";

const toneIconClassName = {
  default: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  info: "text-info",
  destructive: "text-destructive",
} satisfies Record<EmployeeTone, string>;

const toneBadgeVariant = {
  default: "secondary",
  success: "success",
  warning: "warning",
  info: "info",
  destructive: "destructive",
} satisfies Record<EmployeeTone, BadgeProps["variant"]>;

const toneSectionVariant = {
  default: "default",
  success: "default",
  warning: "warning",
  info: "info",
  destructive: "destructive",
} as const satisfies Record<
  EmployeeTone,
  "default" | "warning" | "info" | "destructive"
>;

interface EmployeePageProps {
  title: string;
  description?: string;
  hideHeaderOnMobile?: boolean;
  badge?: {
    children: ReactNode;
    variant?: BadgeProps["variant"];
  };
  action?: ReactNode;
  children: ReactNode;
}

export function EmployeePage({
  title,
  description,
  hideHeaderOnMobile = false,
  badge,
  action,
  children,
}: EmployeePageProps) {
  return (
    <div className="flex w-full flex-col gap-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200">
      <AppPageHeader
        title={title}
        description={description}
        badge={badge}
        actions={action}
        className={hideHeaderOnMobile ? "sr-only sm:not-sr-only" : undefined}
      />
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

interface EmployeeStackProps {
  children: ReactNode;
  className?: string;
}

export function EmployeeStack({ children, className }: EmployeeStackProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      {children}
    </div>
  );
}

interface EmployeeDashboardGridProps {
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}

export function EmployeeDashboardGrid({
  children,
  aside,
  className,
}: EmployeeDashboardGridProps) {
  if (!aside) {
    return <EmployeeStack className={className}>{children}</EmployeeStack>;
  }

  return (
    <div className={cn("grid grid-cols-1 gap-3 lg:grid-cols-3", className)}>
      <EmployeeStack className="lg:col-span-2">{children}</EmployeeStack>
      <aside className="flex min-w-0 flex-col gap-3">{aside}</aside>
    </div>
  );
}

interface EmployeePanelProps {
  title?: string;
  description?: string;
  headerHint?: ReactNode;
  icon?: ElementType;
  tone?: EmployeeTone;
  badge?: {
    children: ReactNode;
    variant?: BadgeProps["variant"];
  };
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  size?: "default" | "sm";
}

export function EmployeePanel({
  title,
  description,
  headerHint,
  icon: Icon,
  tone = "default",
  badge,
  action,
  children,
  className,
  contentClassName,
  size,
}: EmployeePanelProps) {
  return (
    <AppSection
      title={title}
      description={description}
      headerHint={headerHint}
      icon={Icon ? <Icon /> : undefined}
      iconClassName={toneIconClassName[tone]}
      badge={
        badge
          ? {
              children: badge.children,
              variant: badge.variant ?? toneBadgeVariant[tone],
            }
          : undefined
      }
      action={action}
      className={cn(
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200",
        className,
      )}
      contentClassName={contentClassName}
      size={size}
      tone={toneSectionVariant[tone]}
    >
      {children}
    </AppSection>
  );
}

interface EmployeeStatusStripProps {
  items: Array<{
    label: string;
    value: ReactNode;
    muted?: boolean;
    mono?: boolean;
  }>;
  className?: string;
}

export function EmployeeStatusStrip({
  items,
  className,
}: EmployeeStatusStripProps) {
  return (
    <div
      className={cn(
        "grid gap-2",
        items.length === 1 && "grid-cols-1",
        items.length === 2 && "grid-cols-2",
        items.length >= 3 && "grid-cols-3",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className="flex min-w-0 flex-col gap-1 rounded-md border bg-background px-2 py-2 transition-[background-color,border-color,box-shadow] duration-150 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200"
        >
          <span className="truncate text-2xs font-medium text-muted-foreground">
            {item.label}
          </span>
          <span
            className={cn(
              "min-w-0 truncate text-sm font-semibold",
              item.mono && "font-mono tabular-nums",
              item.muted ? "text-muted-foreground" : "text-foreground",
            )}
          >
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

interface EmployeeProgressSummaryProps {
  label: string;
  value: number;
  description?: string;
  tone?: ProgressTone;
}

export function EmployeeProgressSummary({
  label,
  value,
  description,
  tone = "default",
}: EmployeeProgressSummaryProps) {
  const safeValue = Math.max(0, Math.min(100, value));

  return (
    <div className="flex min-w-0 flex-col gap-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-muted-foreground">{label}</span>
        <span className="font-mono font-medium tabular-nums text-foreground">
          {safeValue}%
        </span>
      </div>
      <Progress value={safeValue} tone={tone} />
      {description ? (
        <p className="text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

interface EmployeeWorkflowPanelProps {
  title?: string;
  description?: string;
  icon?: ElementType;
  tone?: EmployeeTone;
  badge?: {
    children: ReactNode;
    variant?: BadgeProps["variant"];
  };
  details?: EmployeeDetailListProps["rows"];
  detailsColumns?: EmployeeDetailListProps["columns"];
  progress?: EmployeeProgressSummaryProps;
  primaryAction?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function EmployeeWorkflowPanel({
  title,
  description,
  icon,
  tone = "default",
  badge,
  details,
  detailsColumns = 2,
  progress,
  primaryAction,
  children,
  className,
}: EmployeeWorkflowPanelProps) {
  return (
    <EmployeePanel
      icon={icon}
      title={title}
      description={description}
      tone={tone}
      badge={badge}
      className={className}
      contentClassName="gap-4"
    >
      {details?.length ? (
        <EmployeeDetailList columns={detailsColumns} rows={details} />
      ) : null}
      {progress ? <EmployeeProgressSummary {...progress} /> : null}
      {children}
      {primaryAction ? (
        <div className="flex flex-col gap-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 sm:flex-row">
          {primaryAction}
        </div>
      ) : null}
    </EmployeePanel>
  );
}

interface EmployeeDetailListProps {
  rows: Array<{
    label: string;
    value: ReactNode;
    muted?: boolean;
  }>;
  columns?: 1 | 2 | 3;
  className?: string;
}

export function EmployeeDetailList({
  rows,
  columns = 2,
  className,
}: EmployeeDetailListProps) {
  return (
    <dl
      className={cn(
        "grid gap-x-4 gap-y-3 text-sm",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-3",
        className,
      )}
    >
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{row.label}</dt>
          <dd
            className={cn(
              "mt-1 min-w-0 break-words font-medium",
              row.muted && "text-muted-foreground",
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface EmployeeActionListProps {
  children: ReactNode;
  columns?: 1 | 2;
  className?: string;
}

export function EmployeeActionList({
  children,
  columns = 1,
  className,
}: EmployeeActionListProps) {
  return (
    <ItemGroup
      className={cn(
        "gap-2",
        columns === 2 && "grid grid-cols-1 sm:grid-cols-2",
        className,
      )}
    >
      {children}
    </ItemGroup>
  );
}

interface EmployeeActionItemProps {
  href: string;
  icon?: ElementType;
  title: string;
  description?: string;
  size?: "default" | "sm";
}

export function EmployeeActionItem({
  href,
  icon: Icon,
  title,
  description,
  size,
}: EmployeeActionItemProps) {
  return (
    <Item
      asChild
      variant="outline"
      size={size}
      className={cn(
        "group/employee-action min-h-14 items-center bg-card transition-[transform,background-color,border-color,box-shadow] duration-150 hover:bg-muted/50 active:translate-y-px motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 motion-safe:hover:-translate-y-px hover:shadow-sm",
        size === "sm" && "min-h-12",
      )}
    >
      <Link href={href}>
        {Icon ? (
          <ItemMedia
            variant="icon"
            className="rounded-md bg-muted p-2 text-primary transition-colors duration-150 group-hover/employee-action:bg-primary/10 group-active/employee-action:bg-primary/10"
          >
            <Icon />
          </ItemMedia>
        ) : null}
        <ItemContent>
          <ItemTitle>{title}</ItemTitle>
          {description ? (
            <ItemDescription>{description}</ItemDescription>
          ) : null}
        </ItemContent>
        <ItemActions className="text-muted-foreground">
          <IconChevronRight className="transition-transform duration-150 group-active/employee-action:translate-x-0.5" />
        </ItemActions>
      </Link>
    </Item>
  );
}

interface EmployeeActionSectionProps {
  title: string;
  description?: string;
  links: Array<{
    key: string;
    href: string;
    icon?: ElementType;
    title: string;
    description?: string;
  }>;
  columns?: 1 | 2;
  size?: "default" | "sm";
  className?: string;
}

export function EmployeeActionSection({
  title,
  description,
  links,
  columns = 2,
  size = "sm",
  className,
}: EmployeeActionSectionProps) {
  if (links.length === 0) return null;

  return (
    <EmployeePanel
      title={title}
      description={description}
      size={size}
      className={className}
    >
      <EmployeeActionList columns={columns}>
        {links.map((link) => (
          <EmployeeActionItem
            key={link.key}
            href={link.href}
            icon={link.icon}
            title={link.title}
            description={link.description}
            size={size}
          />
        ))}
      </EmployeeActionList>
    </EmployeePanel>
  );
}

interface EmployeeMissingProfileEmptyProps {
  title?: string;
  description?: string;
  actionLabel?: string;
}

export function EmployeeMissingProfileEmpty({
  title = messages.employee.profile.missingProfileTitle,
  description = messages.employee.profile.missingProfileDescription,
  actionLabel = messages.employee.profile.openProfile,
}: EmployeeMissingProfileEmptyProps) {
  return (
    <Empty>
      <EmptyMedia variant="icon">
        <IconUserCircle />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button
          asChild
          variant="outline"
          size="touch"
          className="w-full sm:w-fit"
        >
          <Link href="/employee/profile">
            <IconUserCircle data-icon="inline-start" />
            {actionLabel}
          </Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
