import Link from "next/link";
import type { ComponentProps, ElementType, ReactNode } from "react";
import {
  ChevronRight as IconChevronRight,
  UserCircle as IconUserCircle,
} from "lucide-react";
import { AppEmptyState, AppPageHeader, AppSection } from "@/components/surface";
import { cn } from "@comtammatu/ui";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
import { Frame } from "@comtammatu/ui/components/frame";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@comtammatu/ui/components/item";
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
    <div className="flex w-full flex-col gap-3">
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
      className={className}
      contentClassName={contentClassName}
      size={size}
      tone={toneSectionVariant[tone]}
    >
      {children}
    </AppSection>
  );
}

type EmployeeFramePad = "none" | "sm";

type EmployeeFrameProps = ComponentProps<"div"> & {
  pad?: EmployeeFramePad;
};

export function EmployeeFrame({
  children,
  className,
  pad = "none",
  ...props
}: EmployeeFrameProps) {
  return (
    <Frame
      data-employee-frame
      className={cn(pad === "sm" && "p-3", className)}
      {...props}
    >
      {children}
    </Frame>
  );
}

type EmployeeControlBarProps = Omit<EmployeeFrameProps, "pad">;

export function EmployeeControlBar({
  children,
  className,
  ...props
}: EmployeeControlBarProps) {
  return (
    <EmployeeFrame
      pad="sm"
      className={cn("flex items-center justify-between gap-2", className)}
      {...props}
    >
      {children}
    </EmployeeFrame>
  );
}

interface EmployeeActionBarProps {
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}

export function EmployeeActionBar({
  children,
  align = "start",
  className,
}: EmployeeActionBarProps) {
  return (
    <div
      data-employee-action-bar
      className={cn(
        "flex flex-col gap-2 sm:flex-row",
        align === "end" && "sm:justify-end",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface EmployeeActionGridProps {
  children: ReactNode;
  columns?: 1 | 2;
  className?: string;
}

export function EmployeeActionGrid({
  children,
  columns = 2,
  className,
}: EmployeeActionGridProps) {
  return (
    <div
      data-employee-action-grid
      className={cn("grid gap-2", columns === 2 && "sm:grid-cols-2", className)}
    >
      {children}
    </div>
  );
}

const inlineStateToneClassName = {
  default: "",
  success: "border-success/20 bg-success/10",
  warning: "border-warning/20 bg-warning/10",
  info: "border-info/20 bg-info/10",
  destructive: "border-destructive/20 bg-destructive/10",
} satisfies Record<EmployeeTone, string>;

interface EmployeeInlineStateProps {
  icon?: ElementType;
  media?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  tone?: EmployeeTone;
  className?: string;
  mediaClassName?: string;
}

export function EmployeeInlineState({
  icon: Icon,
  media,
  title,
  description,
  children,
  actions,
  tone = "default",
  className,
  mediaClassName,
}: EmployeeInlineStateProps) {
  const mediaVariant = mediaClassName ? "image" : "icon";
  return (
    <Item
      variant={tone === "default" ? "muted" : "outline"}
      size="sm"
      className={cn("items-center", inlineStateToneClassName[tone], className)}
    >
      {media ? (
        <ItemMedia variant={mediaVariant} className={mediaClassName}>
          {media}
        </ItemMedia>
      ) : Icon ? (
        <ItemMedia
          variant="icon"
          className={cn(
            "rounded-md bg-background p-2",
            toneIconClassName[tone],
            mediaClassName,
          )}
        >
          <Icon />
        </ItemMedia>
      ) : null}
      {title || description ? (
        <ItemContent className="min-w-0">
          {title ? (
            <ItemTitle size="heading" className="line-clamp-none w-full">
              {title}
            </ItemTitle>
          ) : null}
          {description ? (
            <ItemDescription className="line-clamp-none text-sm leading-6">
              {description}
            </ItemDescription>
          ) : null}
        </ItemContent>
      ) : null}
      {actions ? (
        <ItemActions className="ml-auto shrink-0">{actions}</ItemActions>
      ) : null}
      {children ? <div className="basis-full min-w-0">{children}</div> : null}
    </Item>
  );
}

interface EmployeeBadgeListProps {
  items: Array<{
    key: string;
    label: ReactNode;
    title?: string;
    variant?: BadgeProps["variant"];
  }>;
  className?: string;
}

export function EmployeeBadgeList({
  items,
  className,
}: EmployeeBadgeListProps) {
  return (
    <div
      data-employee-badge-list
      className={cn("flex flex-wrap gap-1.5", className)}
    >
      {items.map((item) => (
        <Badge
          key={item.key}
          variant={item.variant ?? "secondary"}
          title={item.title}
        >
          {item.label}
        </Badge>
      ))}
    </div>
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
    <ItemGroup
      className={cn(
        "grid gap-2",
        items.length === 1 && "grid-cols-1",
        items.length === 2 && "grid-cols-2",
        items.length >= 3 && "grid-cols-3",
        className,
      )}
    >
      {items.map((item) => (
        <Item
          key={item.label}
          variant="outline"
          size="xs"
          className="min-w-0 bg-background transition-[background-color,border-color,box-shadow] duration-150"
        >
          <ItemContent className="min-w-0 gap-1">
            <ItemDescription className="truncate text-2xs font-medium leading-4">
              {item.label}
            </ItemDescription>
            <ItemTitle
              size="heading"
              className={cn(
                "max-w-full whitespace-normal break-words leading-5",
                item.mono && "font-mono tabular-nums",
                item.muted ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {item.value}
            </ItemTitle>
          </ItemContent>
        </Item>
      ))}
    </ItemGroup>
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
  mobileColumns?: 1 | 2;
  wideColumns?: boolean;
  className?: string;
}

function EmployeeActionList({
  children,
  columns = 1,
  mobileColumns = 1,
  wideColumns = false,
  className,
}: EmployeeActionListProps) {
  return (
    <ItemGroup
      className={cn(
        "gap-2",
        columns === 2 &&
          (mobileColumns === 2
            ? "grid grid-cols-2"
            : "grid grid-cols-1 sm:grid-cols-2"),
        columns === 2 && wideColumns && "lg:grid-cols-3 xl:grid-cols-4",
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
  disabled?: boolean;
}

function EmployeeActionItem({
  href,
  icon: Icon,
  title,
  description,
  size,
  disabled,
}: EmployeeActionItemProps) {
  if (disabled) {
    return (
      <Item
        variant="outline"
        size={size}
        aria-disabled="true"
        className={cn(
          "min-h-14 items-start bg-card opacity-50 sm:items-center",
          size === "sm" && "min-h-12",
        )}
      >
        {Icon ? (
          <ItemMedia
            variant="icon"
            className="rounded-md bg-muted p-2 text-muted-foreground"
          >
            <Icon />
          </ItemMedia>
        ) : null}
        <ItemContent className="min-w-0">
          <ItemTitle size="heading" className="line-clamp-none w-full">
            {title}
          </ItemTitle>
          {description ? (
            <ItemDescription className="line-clamp-none text-sm leading-6">
              {description}
            </ItemDescription>
          ) : null}
        </ItemContent>
      </Item>
    );
  }

  return (
    <Item
      variant="outline"
      size={size}
      className={cn(
        "group/employee-action chrome-tap min-h-14 items-start bg-card transition-[background-color,border-color,box-shadow,transform] duration-150 select-none hover:bg-muted/50 hover:shadow-sm active:scale-[0.97] sm:items-center",
        size === "sm" && "min-h-12",
      )}
      render={<Link href={href} />}
    >
      {Icon ? (
        <ItemMedia
          variant="icon"
          className="rounded-md bg-muted p-2 text-primary transition-colors duration-150 group-hover/employee-action:bg-primary/10 group-active/employee-action:bg-primary/10"
        >
          <Icon />
        </ItemMedia>
      ) : null}
      <ItemContent className="min-w-0">
        <ItemTitle size="heading" className="line-clamp-none w-full">
          {title}
        </ItemTitle>
        {description ? (
          <ItemDescription className="line-clamp-none text-sm leading-6">
            {description}
          </ItemDescription>
        ) : null}
      </ItemContent>
      <ItemActions className="self-center text-muted-foreground">
        <IconChevronRight />
      </ItemActions>
    </Item>
  );
}

interface EmployeeActionSectionProps {
  title?: string;
  description?: string;
  links: Array<{
    key: string;
    href: string;
    icon?: ElementType;
    title: string;
    description?: string;
    disabled?: boolean;
  }>;
  columns?: 1 | 2;
  mobileColumns?: 1 | 2;
  wideColumns?: boolean;
  size?: "default" | "sm";
  tone?: EmployeeTone;
  className?: string;
}

export function EmployeeActionSection({
  title,
  description,
  links,
  columns = 2,
  mobileColumns = 1,
  wideColumns = false,
  size = "sm",
  tone = "default",
  className,
}: EmployeeActionSectionProps) {
  if (links.length === 0) return null;

  return (
    <EmployeePanel
      title={title}
      description={description}
      size={size}
      tone={tone}
      className={className}
    >
      <EmployeeActionList
        columns={columns}
        mobileColumns={mobileColumns}
        wideColumns={wideColumns}
      >
        {links.map((link) => (
          <EmployeeActionItem
            key={link.key}
            href={link.href}
            icon={link.icon}
            title={link.title}
            description={link.description}
            size={size}
            disabled={link.disabled}
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
  profileHref: string;
}

export function EmployeeMissingProfileEmpty({
  title = messages.employee.profile.missingProfileTitle,
  description = messages.employee.profile.missingProfileDescription,
  actionLabel = messages.employee.profile.openProfile,
  profileHref,
}: EmployeeMissingProfileEmptyProps) {
  return (
    <AppEmptyState
      title={title}
      description={description}
      icon={<IconUserCircle />}
    >
      <Button
        variant="outline"
        size="touch"
        className="w-full sm:w-fit"
        render={<Link href={profileHref} />}
      >
        <IconUserCircle data-icon="inline-start" />
        {actionLabel}
      </Button>
    </AppEmptyState>
  );
}
