import Link from "next/link";
import type { ComponentProps, ElementType, ReactNode } from "react";
import { ChevronRight as IconChevronRight } from "lucide-react";
import { AppPageHeader, AppSection } from "@/components/surface";
import { cn } from "@comtammatu/ui";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
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
import { Skeleton } from "@comtammatu/ui/components/skeleton";

type BranchOperatorTone =
  "default" | "success" | "warning" | "info" | "destructive";

const toneIconClassName = {
  default: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  info: "text-info",
  destructive: "text-destructive",
} satisfies Record<BranchOperatorTone, string>;

const toneBadgeVariant = {
  default: "secondary",
  success: "success",
  warning: "warning",
  info: "info",
  destructive: "destructive",
} satisfies Record<BranchOperatorTone, BadgeProps["variant"]>;

const toneSectionVariant = {
  default: "default",
  success: "default",
  warning: "warning",
  info: "info",
  destructive: "destructive",
} as const satisfies Record<
  BranchOperatorTone,
  "default" | "warning" | "info" | "destructive"
>;

export const BRANCH_OPERATOR_DETAIL_GRID_CLASSNAME =
  "grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)] lg:items-start";

export interface BranchOperatorPageProps {
  title: string;
  description?: string;
  hideHeaderOnMobile?: boolean;
  badge?: {
    children: ReactNode;
    variant?: BadgeProps["variant"];
  };
  action?: ReactNode;
  fill?: boolean;
  children: ReactNode;
}

export function BranchOperatorPage({
  title,
  description,
  hideHeaderOnMobile = false,
  badge,
  action,
  fill = false,
  children,
}: BranchOperatorPageProps) {
  return (
    <div
      data-slot="branch-operator-page"
      className={cn("flex min-w-0 flex-col gap-3", fill && "min-h-0 flex-1")}
    >
      <AppPageHeader
        title={title}
        description={description}
        className={hideHeaderOnMobile ? "max-sm:sr-only" : undefined}
        compactOnMobile={hideHeaderOnMobile}
        badge={badge}
        actions={action}
      />
      {children}
    </div>
  );
}

export interface BranchOperatorPanelProps {
  title?: string;
  description?: string;
  headerHint?: ReactNode;
  icon?: ElementType;
  tone?: BranchOperatorTone;
  badge?: {
    children: ReactNode;
    variant?: BadgeProps["variant"];
  };
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  size?: "default" | "sm";
  headingLevel?: "h2" | "h3" | "h4";
}

export function BranchOperatorPanel({
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
  headingLevel,
}: BranchOperatorPanelProps) {
  return (
    <AppSection
      title={title}
      headingLevel={headingLevel}
      description={description}
      headerHint={headerHint}
      icon={Icon ? <Icon aria-hidden="true" /> : undefined}
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

export interface BranchOperatorPanelSkeletonProps {
  title?: string;
  tone?: BranchOperatorTone;
  rows?: 1 | 2 | 3;
  size?: "default" | "sm";
}

export function BranchOperatorPanelSkeleton({
  title,
  tone = "default",
  rows = 2,
  size = "sm",
}: BranchOperatorPanelSkeletonProps) {
  return (
    <BranchOperatorPanel title={title} tone={tone} size={size}>
      <div aria-busy="true" className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-md" />
        ))}
      </div>
    </BranchOperatorPanel>
  );
}

type BranchOperatorFramePad = "none" | "sm";

export type BranchOperatorFrameProps = ComponentProps<"div"> & {
  pad?: BranchOperatorFramePad;
};

export function BranchOperatorFrame({
  children,
  className,
  pad = "none",
  ...props
}: BranchOperatorFrameProps) {
  return (
    <Frame
      data-branch-operator-frame
      className={cn(pad === "sm" && "p-3", className)}
      {...props}
    >
      {children}
    </Frame>
  );
}

export type BranchOperatorControlBarProps = Omit<
  BranchOperatorFrameProps,
  "pad"
>;

export function BranchOperatorControlBar({
  children,
  className,
  ...props
}: BranchOperatorControlBarProps) {
  return (
    <BranchOperatorFrame
      pad="sm"
      className={cn("flex items-center justify-between gap-2", className)}
      {...props}
    >
      {children}
    </BranchOperatorFrame>
  );
}

export function BranchOperatorControlBarSkeleton() {
  return (
    <BranchOperatorControlBar aria-busy="true">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-40 max-w-full" />
        <Skeleton className="mt-2 h-3 w-56 max-w-full" />
      </div>
      <Skeleton className="h-10 w-24 rounded-md" />
    </BranchOperatorControlBar>
  );
}

export interface BranchOperatorActionBarProps {
  children: ReactNode;
  align?: "start" | "end";
  className?: string;
}

export function BranchOperatorActionBar({
  children,
  align = "start",
  className,
}: BranchOperatorActionBarProps) {
  return (
    <div
      data-branch-operator-action-bar
      className={cn(
        "flex flex-col gap-2 lg:flex-row",
        align === "end" && "lg:justify-end",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface BranchOperatorActionGridProps {
  children: ReactNode;
  columns?: 1 | 2;
  className?: string;
}

export function BranchOperatorActionGrid({
  children,
  columns = 2,
  className,
}: BranchOperatorActionGridProps) {
  return (
    <div
      data-branch-operator-action-grid
      className={cn("grid gap-2", columns === 2 && "lg:grid-cols-2", className)}
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
} satisfies Record<BranchOperatorTone, string>;

export interface BranchOperatorInlineStateProps {
  icon?: ElementType;
  media?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  tone?: BranchOperatorTone;
  className?: string;
  mediaClassName?: string;
}

export function BranchOperatorInlineState({
  icon: Icon,
  media,
  title,
  description,
  children,
  actions,
  tone = "default",
  className,
  mediaClassName,
}: BranchOperatorInlineStateProps) {
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

export interface BranchOperatorBadgeListProps {
  items: Array<{
    key: string;
    label: ReactNode;
    title?: string;
    variant?: BadgeProps["variant"];
  }>;
  className?: string;
}

export function BranchOperatorBadgeList({
  items,
  className,
}: BranchOperatorBadgeListProps) {
  return (
    <div
      data-branch-operator-badge-list
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

export interface BranchOperatorStatusStripProps {
  items: Array<{
    label: string;
    value: ReactNode;
    muted?: boolean;
    mono?: boolean;
  }>;
  className?: string;
}

export function BranchOperatorStatusStrip({
  items,
  className,
}: BranchOperatorStatusStripProps) {
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

export interface BranchOperatorDetailListProps {
  rows: Array<{
    label: string;
    value: ReactNode;
    muted?: boolean;
  }>;
  columns?: 1 | 2 | 3;
  className?: string;
}

export function BranchOperatorDetailList({
  rows,
  columns = 2,
  className,
}: BranchOperatorDetailListProps) {
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

interface BranchOperatorActionListProps {
  children: ReactNode;
  columns?: 1 | 2;
  mobileColumns?: 1 | 2;
  wideColumns?: boolean;
  presentation?: "panel" | "plain" | "stations";
  itemCount?: number;
  className?: string;
}

function BranchOperatorActionList({
  children,
  columns = 1,
  mobileColumns = 1,
  wideColumns = false,
  presentation = "panel",
  itemCount = 0,
  className,
}: BranchOperatorActionListProps) {
  return (
    <ItemGroup
      className={cn(
        "gap-2",
        presentation === "stations" && "grid grid-cols-1",
        presentation === "stations" && itemCount === 2 && "sm:grid-cols-2",
        presentation === "stations" && itemCount >= 3 && "sm:grid-cols-3",
        presentation !== "stations" &&
          columns === 2 &&
          (mobileColumns === 2
            ? "grid grid-cols-2"
            : "grid grid-cols-1 lg:grid-cols-2"),
        presentation !== "stations" &&
          columns === 2 &&
          wideColumns &&
          "xl:grid-cols-3 2xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </ItemGroup>
  );
}

interface BranchOperatorActionItemProps {
  href: string;
  icon?: ElementType;
  title: string;
  description?: string;
  size?: "default" | "sm";
  disabled?: boolean;
  disabledReason?: string;
  presentation?: "panel" | "plain" | "stations";
}

function BranchOperatorActionItem({
  href,
  icon: Icon,
  title,
  description,
  size,
  disabled,
  disabledReason,
  presentation = "panel",
}: BranchOperatorActionItemProps) {
  if (disabled) {
    return (
      <Item
        variant="outline"
        size={size}
        aria-disabled="true"
        className={cn(
          "items-start bg-card opacity-50",
          presentation === "stations"
            ? "min-h-20 items-center sm:min-h-24 sm:items-start"
            : "min-h-14 lg:items-center",
          presentation !== "stations" && size === "sm" && "min-h-12",
        )}
      >
        {Icon ? (
          <ItemMedia
            variant="icon"
            className={cn(
              "rounded-md p-2",
              presentation === "stations"
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            <Icon />
          </ItemMedia>
        ) : null}
        <ItemContent className="min-w-0">
          <ItemTitle size="heading" className="line-clamp-none w-full">
            {title}
          </ItemTitle>
          {description ? (
            <ItemDescription
              className={cn(
                "line-clamp-none",
                presentation !== "stations" && "text-sm leading-6",
              )}
            >
              {description}
            </ItemDescription>
          ) : null}
          {disabledReason ? (
            <ItemDescription className="line-clamp-none text-xs font-medium text-warning">
              {disabledReason}
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
        "group/branch-operator-action chrome-tap items-start bg-card transition-[background-color,border-color,box-shadow,transform] duration-150 select-none hover:bg-muted/50 hover:shadow-effect-card-hover active:scale-[0.97]",
        presentation === "stations"
          ? "min-h-20 items-center sm:min-h-24 sm:items-start"
          : "min-h-14 lg:items-center",
        presentation !== "stations" && size === "sm" && "min-h-12",
      )}
      render={<Link href={href} />}
    >
      {Icon ? (
        <ItemMedia
          variant="icon"
          className={cn(
            "rounded-md p-2 text-primary transition-colors duration-150 group-hover/branch-operator-action:bg-primary/10 group-active/branch-operator-action:bg-primary/10",
            presentation === "stations" ? "bg-primary/10" : "bg-muted",
          )}
        >
          <Icon />
        </ItemMedia>
      ) : null}
      <ItemContent className="min-w-0">
        <ItemTitle size="heading" className="line-clamp-none w-full">
          {title}
        </ItemTitle>
        {description ? (
          <ItemDescription
            className={cn(
              "line-clamp-none",
              presentation !== "stations" && "text-sm leading-6",
            )}
          >
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

export interface BranchOperatorActionSectionProps {
  title?: string;
  description?: string;
  links: Array<{
    key: string;
    href: string;
    icon?: ElementType;
    title: string;
    description?: string;
    disabled?: boolean;
    disabledReason?: string;
  }>;
  columns?: 1 | 2;
  mobileColumns?: 1 | 2;
  wideColumns?: boolean;
  size?: "default" | "sm";
  tone?: BranchOperatorTone;
  presentation?: "panel" | "plain" | "stations";
  className?: string;
}

export function BranchOperatorActionSection({
  title,
  description,
  links,
  columns = 2,
  mobileColumns = 1,
  wideColumns = false,
  size = "sm",
  tone = "default",
  presentation = "panel",
  className,
}: BranchOperatorActionSectionProps) {
  if (links.length === 0) return null;

  const content = (
    <BranchOperatorActionList
      columns={columns}
      mobileColumns={mobileColumns}
      wideColumns={wideColumns}
      presentation={presentation}
      itemCount={links.length}
    >
      {links.map((link) => (
        <BranchOperatorActionItem
          key={link.key}
          href={link.href}
          icon={link.icon}
          title={link.title}
          description={link.description}
          size={size}
          disabled={link.disabled}
          disabledReason={link.disabledReason}
          presentation={presentation}
        />
      ))}
    </BranchOperatorActionList>
  );

  if (presentation === "panel") {
    return (
      <BranchOperatorPanel
        title={title}
        description={description}
        size={size}
        tone={tone}
        className={className}
      >
        {content}
      </BranchOperatorPanel>
    );
  }

  return (
    <section className={cn("flex flex-col gap-2", className)}>
      {title || description ? (
        <div className="flex flex-col gap-1">
          {title ? (
            <h2 className="font-heading text-base font-semibold">{title}</h2>
          ) : null}
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
      ) : null}
      {content}
    </section>
  );
}
