"use client";

import Link from "next/link";
import React, {
  createContext,
  useContext,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  ArrowLeft as IconArrowLeft,
  ArrowRight as IconArrowRight,
  ChevronDown as IconChevronDown,
} from "lucide-react";
import { ACTIONS_VI, ERRORS_VI, STATES_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@comtammatu/ui/components/collapsible";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@comtammatu/ui/components/empty";
import { Separator } from "@comtammatu/ui/components/separator";
import { Toolbar, ToolbarGroup } from "@comtammatu/ui/components/toolbar";
import { BrandSymbol, type BrandSymbolVariant } from "@/components/brand";

export type SurfaceWidth = "narrow" | "default" | "wide" | "xwide" | "full";
export type SurfaceTone =
  | "primary"
  | "success"
  | "warning"
  | "info"
  | "secondary";

// `xwide` is the one named exception to the arbitrary-dimension ban
// (design-system.md § Rhythm Contract / app-arbitrary-sizing gate): a single
// capped tier for dense data-table/list pages on wide desktop viewports, so
// the 1600px value lives in exactly one place instead of per-page overrides.
const PAGE_WIDTH_CLASSNAME: Record<SurfaceWidth, string> = {
  narrow: "max-w-xl",
  default: "max-w-5xl",
  wide: "max-w-7xl",
  xwide: "max-w-[1600px]",
  full: "max-w-none",
};

const TONE_CLASSNAME: Record<SurfaceTone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  info: "bg-info/10 text-info",
  secondary: "bg-secondary text-secondary-foreground",
};

// Page-padding ownership (design-system.md § E): outer page padding is applied
// once and never compounds. `padded` marks an ancestor that already applied the
// page padding (AppShell main or another AppPage); `constrained` marks an
// ancestor AppPage that already applied the centered max-width. A nested AppPage
// reads these and drops whatever an ancestor already owns.
type SurfaceNesting = { padded: boolean; constrained: boolean };

const SURFACE_NESTING_NONE: SurfaceNesting = {
  padded: false,
  constrained: false,
};
const SURFACE_NESTING_SHELL: SurfaceNesting = {
  padded: true,
  constrained: false,
};
const SURFACE_NESTING_PAGE: SurfaceNesting = {
  padded: true,
  constrained: true,
};

const SurfaceNestingContext =
  createContext<SurfaceNesting>(SURFACE_NESTING_NONE);

/**
 * Marks the AppShell main region as the owner of the Management frame padding so
 * a nested AppPage drops its own padding (keeping its centered max-width). Keeps
 * page padding from compounding into the double-padding the audit flagged.
 */
export function AppShellPaddingBoundary({ children }: { children: ReactNode }) {
  return (
    <SurfaceNestingContext.Provider value={SURFACE_NESTING_SHELL}>
      {children}
    </SurfaceNestingContext.Provider>
  );
}

export type AppPageProps = {
  children: ReactNode;
  as?: "div" | "main";
  id?: string;
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
  as = "div",
  id,
  className,
  contentClassName,
  scroll = false,
  width = "wide",
  padded = true,
  density = "comfortable",
  mobile = false,
}: AppPageProps) {
  const Root = as;
  const isCompact = density === "compact";
  const nesting = useContext(SurfaceNestingContext);
  const applyPadding = padded && !nesting.padded;
  const applyMaxWidth = !nesting.constrained;
  return (
    <SurfaceNestingContext.Provider value={SURFACE_NESTING_PAGE}>
      <Root
        id={id}
        data-ui="app-page"
        data-width={width}
        data-density={density}
        data-scroll={scroll ? "true" : undefined}
        data-mobile={mobile ? "true" : undefined}
        className={cn(
          "min-h-0 flex-1",
          scroll ? "no-scrollbar overflow-auto" : "overflow-visible",
          applyPadding && (isCompact ? "p-3" : "p-4"),
          mobile && "pb-28",
          className,
        )}
      >
        <div
          data-ui-slot="content"
          className={cn(
            "mx-auto flex w-full flex-col",
            isCompact ? "gap-3" : "gap-4",
            applyMaxWidth
              ? mobile
                ? "max-w-2xl"
                : PAGE_WIDTH_CLASSNAME[width]
              : "max-w-none",
            contentClassName,
          )}
        >
          {children}
        </div>
      </Root>
    </SurfaceNestingContext.Provider>
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
    <header
      data-ui="app-page-header"
      className={cn("flex flex-col gap-2", className)}
    >
      {breadcrumb ? <div data-ui-slot="breadcrumb">{breadcrumb}</div> : null}
      <div
        data-ui-slot="layout"
        className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
      >
        <div data-ui-slot="heading" className="flex min-w-0 flex-col gap-1">
          {eyebrow ? (
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {eyebrow}
            </div>
          ) : null}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Heading
              data-ui-slot="title"
              className={cn(
                "font-heading min-w-0 text-xl font-semibold tracking-tight sm:text-2xl",
                titleClassName,
              )}
            >
              {title}
            </Heading>
            {badge ? (
              <Badge variant={badge.variant ?? "secondary"}>
                {badge.children}
              </Badge>
            ) : null}
          </div>
          {description ? (
            <div
              data-ui-slot="description"
              className="max-w-3xl text-sm leading-6 text-muted-foreground"
            >
              {description}
            </div>
          ) : null}
          {meta ? (
            <div data-ui-slot="meta" className="text-xs text-muted-foreground">
              {meta}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div
            data-ui-slot="actions"
            className="flex shrink-0 flex-wrap items-center gap-2"
          >
            {actions}
          </div>
        ) : null}
      </div>
      {tabs ? <div data-ui-slot="tabs">{tabs}</div> : null}
    </header>
  );
}

export type AppBackLinkProps = {
  href: string;
  children?: ReactNode;
  className?: string;
  "aria-label"?: string;
  onClick?: ComponentProps<typeof Link>["onClick"];
};

/**
 * Back-navigation affordance for the AppPageHeader breadcrumb slot (or an
 * equivalent in-page back link on chrome-less surfaces). Centralizes the
 * className that route files were duplicating by hand.
 */
export function AppBackLink({
  href,
  children,
  className,
  ...props
}: AppBackLinkProps) {
  return (
    <Link
      href={href}
      data-ui="app-back-link"
      className={cn(
        "inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline",
        className,
      )}
      {...props}
    >
      <IconArrowLeft className="size-4" />
      {children != null ? <> {children}</> : null}
    </Link>
  );
}

type AppSectionTone = "default" | "info" | "warning" | "destructive";

const SECTION_TONE_CLASSNAME: Record<AppSectionTone, string> = {
  default: "",
  info: "border-info/20 bg-info/10",
  warning: "border-warning/20 bg-warning/10",
  destructive: "border-destructive/20 bg-destructive/10",
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
   * Pass-through className to CardContent for layout composition only.
   * Use `contentFlush` for table-edge/list-edge alignment and
   * `contentScroll` for horizontal table scrolling.
   */
  contentClassName?: string;
  contentFlush?: boolean;
  contentScroll?: boolean;
  size?: "default" | "sm";
  tone?: AppSectionTone;
  collapsible?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  contentFlush = false,
  contentScroll = false,
  size = "default",
  tone = "default",
  collapsible = false,
  defaultOpen = true,
  open,
  onOpenChange,
  footer,
}: AppSectionProps) {
  const hasHeader = Boolean(
    title ||
    description ||
    headerHint ||
    icon ||
    badge ||
    action ||
    collapsible,
  );
  const chevronAction = collapsible ? (
    <CollapsibleTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        data-ui="app-section-toggle"
        className="text-muted-foreground transition-colors hover:text-foreground"
      >
        <IconChevronDown className="size-4 transition-transform group-data-[state=closed]/button:-rotate-90" />
        <span className="sr-only group-data-[state=open]/button:hidden">
          {typeof title === "string" ? `${title}: ` : null}
          {ACTIONS_VI.showMore}
        </span>
        <span className="sr-only group-data-[state=closed]/button:hidden">
          {typeof title === "string" ? `${title}: ` : null}
          {ACTIONS_VI.showLess}
        </span>
      </Button>
    </CollapsibleTrigger>
  ) : null;

  return (
    <Collapsible
      asChild
      open={collapsible ? open : true}
      defaultOpen={collapsible ? defaultOpen : undefined}
      onOpenChange={collapsible ? onOpenChange : undefined}
    >
      <Card
        size={size}
        data-ui="app-section"
        data-tone={tone}
        data-collapsible={collapsible ? "true" : undefined}
        className={cn(SECTION_TONE_CLASSNAME[tone], className)}
      >
        {hasHeader ? (
          <CardHeader className="has-data-[slot=card-action]:grid-cols-1 sm:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
            <CardTitle
              className={cn(
                "flex min-w-0 items-center gap-2",
                headerHint &&
                  "flex-col items-start sm:flex-row sm:items-center",
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
                <span className="min-w-0 break-words leading-snug">
                  {title}
                </span>
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
              <CardAction className="col-start-1 row-span-1 row-start-auto flex flex-wrap items-center justify-start gap-2 justify-self-start sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:justify-end sm:justify-self-end">
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
        <CollapsibleContent
          data-ui-slot="content"
          className={cn("flex flex-col", size === "sm" ? "gap-3" : "gap-4")}
        >
          <CardContent
            flush={contentFlush}
            scroll={contentScroll}
            className={cn(
              "flex min-w-0 flex-col gap-3",
              !hasHeader && "pt-0",
              contentClassName,
            )}
          >
            {children}
          </CardContent>
          {footer ? (
            <CardFooter className="flex items-center justify-end gap-2 border-t">
              {footer}
            </CardFooter>
          ) : null}
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export type AppToolbarProps = {
  children?: ReactNode;
  className?: string;
  variant?: "card" | "inline";
  search?: ReactNode;
  filters?: ReactNode;
  bulk?: ReactNode;
  actions?: ReactNode;
  reset?: ReactNode;
};

export function AppToolbar({
  children,
  className,
  variant = "card",
  search,
  filters,
  bulk,
  actions,
  reset,
}: AppToolbarProps) {
  const hasSlots =
    search != null ||
    filters != null ||
    bulk != null ||
    actions != null ||
    reset != null;

  const content = hasSlots ? (
    <>
      {search ? (
        <ToolbarGroup className="min-w-0 flex-1 gap-2">{search}</ToolbarGroup>
      ) : null}
      {filters ? (
        <ToolbarGroup className="gap-2">{filters}</ToolbarGroup>
      ) : null}
      {bulk ? (
        <>
          <Separator orientation="vertical" className="h-6" />
          <ToolbarGroup className="gap-2">{bulk}</ToolbarGroup>
        </>
      ) : null}
      {actions ? (
        <>
          {search || filters || bulk ? (
            <Separator orientation="vertical" className="h-6" />
          ) : null}
          <ToolbarGroup className="gap-2">{actions}</ToolbarGroup>
        </>
      ) : null}
      {reset ? <ToolbarGroup className="gap-2">{reset}</ToolbarGroup> : null}
    </>
  ) : (
    children
  );

  if (variant === "inline") {
    return (
      <Toolbar
        data-ui="app-toolbar"
        className={cn("gap-3 border-b bg-muted/30 p-3", className)}
      >
        {content}
      </Toolbar>
    );
  }

  return (
    <Card size="sm" data-ui="app-toolbar">
      <CardContent>
        <Toolbar className={cn("gap-3", className)}>{content}</Toolbar>
      </CardContent>
    </Card>
  );
}

export type DocumentFormFrameProps = {
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  contentClassName?: string;
  bodyClassName?: string;
  scroll?: boolean;
  width?: SurfaceWidth;
  padded?: boolean;
  density?: AppPageProps["density"];
  mobile?: boolean;
};

export function DocumentFormFrame({
  header,
  children,
  footer,
  className,
  contentClassName,
  bodyClassName,
  scroll = false,
  width = "wide",
  padded = true,
  density = "comfortable",
  mobile = false,
}: DocumentFormFrameProps) {
  return (
    <AppPage
      scroll={scroll}
      width={width}
      padded={padded}
      density={density}
      mobile={mobile}
      className={className}
      contentClassName={contentClassName}
    >
      {header}
      <div
        data-ui="document-form-body"
        className={cn("flex min-w-0 flex-col gap-4", bodyClassName)}
      >
        {children}
      </div>
      {footer}
    </AppPage>
  );
}

type OperationalTileTone = "default" | "success" | "warning" | "muted";

const OPERATIONAL_TILE_TONE_CLASSNAME: Record<OperationalTileTone, string> = {
  default: "bg-card hover:border-primary/20",
  success:
    "border-success/20 bg-success/10 text-foreground hover:border-success/20 hover:bg-success/20",
  warning:
    "border-warning/20 bg-warning/10 text-foreground hover:border-warning/20 hover:bg-warning/20",
  muted: "bg-muted/50 text-muted-foreground hover:border-border",
};

export type OperationalTileProps = ComponentProps<typeof Button> & {
  selected?: boolean;
  tone?: OperationalTileTone;
};

export function OperationalTile({
  selected,
  tone = "default",
  variant,
  className,
  "aria-pressed": ariaPressed,
  ...props
}: OperationalTileProps) {
  const isSelected = selected === true;
  const hasSelectionState = selected !== undefined;

  return (
    <Button
      data-ui="operational-tile"
      data-state={
        hasSelectionState ? (isSelected ? "selected" : "unselected") : "idle"
      }
      data-tone={tone}
      aria-pressed={ariaPressed ?? (hasSelectionState ? isSelected : undefined)}
      variant={variant ?? (isSelected ? "default" : "outline")}
      className={cn(
        isSelected
          ? "border-primary/20 ring-2 ring-primary/20"
          : OPERATIONAL_TILE_TONE_CLASSNAME[tone],
        className,
      )}
      {...props}
    />
  );
}

const OPERATIONAL_BOARD_CURRENT_CLASSNAME: Record<SurfaceTone, string> = {
  primary: "relative z-10 bg-primary/10 ring-2 ring-primary/20",
  success: "relative z-10 bg-success/10 ring-2 ring-success/20",
  warning: "relative z-10 bg-warning/15 ring-2 ring-warning/20",
  info: "relative z-10 bg-info/10 ring-2 ring-info/20",
  secondary: "relative z-10 bg-secondary/10 ring-2 ring-secondary/20",
};

export type OperationalBoardCardProps = ComponentProps<typeof Card> & {
  current?: boolean;
  currentTone?: SurfaceTone;
  interactive?: boolean;
};

export function OperationalBoardCard({
  current = false,
  currentTone = "primary",
  interactive = false,
  className,
  ...props
}: OperationalBoardCardProps) {
  return (
    <Card
      data-ui="operational-board-card"
      data-state={current ? "current" : "idle"}
      data-tone={currentTone}
      data-interactive={interactive ? "true" : undefined}
      className={cn(
        "transition",
        interactive && "hover:shadow-effect-card-hover",
        current && OPERATIONAL_BOARD_CURRENT_CLASSNAME[currentTone],
        className,
      )}
      {...props}
    />
  );
}

export type AppEmptyStateMode =
  | "no-data"
  | "no-results"
  | "no-access"
  | "error";

const EMPTY_STATE_COPY: Record<AppEmptyStateMode, string> = {
  "no-data": STATES_VI.empty,
  "no-results": STATES_VI.noResults,
  "no-access": STATES_VI.noAccess,
  error: ERRORS_VI.loadFailed,
};

type AppEmptyRootProps = Omit<
  ComponentProps<typeof Empty>,
  "children" | "className" | "title"
>;

export type AppEmptyStateProps = AppEmptyRootProps & {
  title?: string;
  mode?: AppEmptyStateMode;
  description?: string;
  icon?: ReactNode;
  iconClassName?: string;
  /**
   * Decorative Concept 01 brand symbol rendered in place of `icon`. Static
   * only — no mascot, no motion (design-system.md § brand rules).
   */
  symbol?: BrandSymbolVariant;
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
  symbol,
  children,
  className,
  titleClassName,
  descriptionClassName,
  compact = false,
  align = "center",
  ...props
}: AppEmptyStateProps) {
  return (
    <Empty
      data-ui="app-empty-state"
      data-mode={mode}
      data-density={compact ? "compact" : "comfortable"}
      data-align={align}
      className={cn(
        "border bg-card",
        compact ? "py-6" : "py-12",
        align === "start" && "items-start text-left",
        className,
      )}
      {...props}
    >
      {symbol ? (
        <EmptyMedia variant="default" className={iconClassName}>
          <BrandSymbol variant={symbol} size="lg" />
        </EmptyMedia>
      ) : icon ? (
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
            <span className="text-xs text-muted-foreground">
              {metric.label}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const inner = (
    <div className="group flex h-full flex-col justify-between gap-4 p-4">
      <div className="flex flex-col gap-3">
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
        <div className="flex min-w-0 flex-col gap-1">
          <p className="font-heading text-base font-semibold tracking-tight">
            {title}
          </p>
          {description ? (
            <p className="text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
          {disabled && disabledReason ? (
            <p className="text-xs text-muted-foreground">{disabledReason}</p>
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
      data-ui="app-link-card"
      data-state={disabled ? "disabled" : "enabled"}
      data-tone={tone}
      className={cn(
        "h-full transition",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:shadow-effect-card-hover",
      )}
    >
      <CardContent flush className="h-full">
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

export type KpiRowProps = {
  children: ReactNode;
  className?: string;
  density?: "comfortable" | "compact";
};

export function KpiRow({
  children,
  className,
  density = "comfortable",
}: KpiRowProps) {
  const isCompact = density === "compact";
  return (
    <div
      data-ui="kpi-row"
      data-density={density}
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        isCompact ? "gap-2" : "gap-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type DescriptionListItem = {
  term: ReactNode;
  description: ReactNode;
};

export type DescriptionListProps = {
  items: DescriptionListItem[];
  className?: string;
  termClassName?: string;
  descriptionClassName?: string;
};

export function DescriptionList({
  items,
  className,
  termClassName,
  descriptionClassName,
}: DescriptionListProps) {
  return (
    <dl
      data-ui="description-list"
      className={cn("flex flex-col gap-3", className)}
    >
      {items.map((item, index) => (
        <div key={index} className="flex flex-col gap-1">
          <dt
            className={cn(
              "text-xs font-medium uppercase tracking-wide text-muted-foreground",
              termClassName,
            )}
          >
            {item.term}
          </dt>
          <dd className={cn("text-sm leading-6", descriptionClassName)}>
            {item.description}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export type LinkCardGridProps = {
  children: ReactNode;
  className?: string;
};

export function LinkCardGrid({ children, className }: LinkCardGridProps) {
  return (
    <div
      data-ui="link-card-grid"
      className={cn(
        "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

export type AppDetailFooterProps = {
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
  sticky?: boolean;
  mobileReverse?: boolean;
  stacked?: boolean;
};

export function AppDetailFooter({
  leading,
  trailing,
  className,
  sticky = false,
  mobileReverse = false,
  stacked = false,
}: AppDetailFooterProps) {
  const hasLeading = leading != null;
  const hasTrailing = trailing != null;

  return (
    <footer
      data-ui="app-detail-footer"
      data-sticky={sticky ? "true" : undefined}
      className={cn(
        "flex border-t border-border",
        mobileReverse ? "flex-col-reverse" : "flex-col",
        stacked
          ? "sm:flex-col sm:items-stretch"
          : "sm:flex-row sm:items-center sm:justify-between",
        sticky
          ? "sticky bottom-0 z-10 gap-2 bg-background p-2 shadow-lg chrome-safe-pb [&_[data-slot=button]]:w-full sm:[&_[data-slot=button]]:w-auto"
          : "gap-3 py-6",
        className,
      )}
    >
      {hasLeading ? (
        <div
          className={cn(
            "flex min-w-0 flex-col gap-2",
            !stacked && "sm:flex-row sm:items-center",
          )}
        >
          {leading}
        </div>
      ) : null}
      {hasTrailing ? (
        <div
          className={cn(
            "flex min-w-0 flex-col gap-2",
            !stacked && "sm:flex-row sm:items-center sm:justify-end",
            !hasLeading && "w-full",
          )}
        >
          {trailing}
        </div>
      ) : null}
    </footer>
  );
}
