import Link from "next/link";
import type { ElementType, ReactNode } from "react";
import { ChevronRight as IconChevronRight } from "lucide-react";
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
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";

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

interface EmployeePageProps {
  title: string;
  description?: string;
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
  badge,
  action,
  children,
}: EmployeePageProps) {
  return (
    <div className="flex w-full flex-col gap-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-lg font-semibold tracking-tight">
              {title}
            </h1>
            {badge ? (
              <Badge variant={badge.variant ?? "secondary"}>
                {badge.children}
              </Badge>
            ) : null}
          </div>
          {description ? (
            <p className="max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {action ? (
          <div className="flex shrink-0 items-center">{action}</div>
        ) : null}
      </header>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

interface EmployeePanelProps {
  title?: string;
  description?: string;
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
}

export function EmployeePanel({
  title,
  description,
  icon: Icon,
  tone = "default",
  badge,
  action,
  children,
  className,
  contentClassName,
}: EmployeePanelProps) {
  const hasHeader = Boolean(title || description || Icon || badge || action);

  return (
    <Card className={className}>
      {hasHeader ? (
        <CardHeader>
          <CardTitle className="flex min-w-0 items-center gap-2">
            {Icon ? (
              <Icon
                className={cn("size-4 shrink-0", toneIconClassName[tone])}
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
                <Badge variant={badge.variant ?? toneBadgeVariant[tone]}>
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
          "flex flex-col gap-3",
          !hasHeader && "pt-0",
          contentClassName,
        )}
      >
        {children}
      </CardContent>
    </Card>
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
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-3",
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
        columns === 2 && "sm:grid sm:grid-cols-2",
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
}

export function EmployeeActionItem({
  href,
  icon: Icon,
  title,
  description,
}: EmployeeActionItemProps) {
  return (
    <Item asChild variant="outline" className="items-center">
      <Link href={href}>
        {Icon ? (
          <ItemMedia variant="icon">
            <Icon />
          </ItemMedia>
        ) : null}
        <ItemContent>
          <ItemTitle>{title}</ItemTitle>
          {description ? (
            <ItemDescription>{description}</ItemDescription>
          ) : null}
        </ItemContent>
        <ItemActions>
          <IconChevronRight className="size-4 text-muted-foreground" />
        </ItemActions>
      </Link>
    </Item>
  );
}
