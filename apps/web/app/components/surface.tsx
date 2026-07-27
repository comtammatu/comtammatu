"use client";

import Link from "next/link";
import {
  createContext,
  useContext,
  useState,
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

type SurfaceWidth = "narrow" | "default" | "wide" | "xwide" | "full";
type SurfaceTone = "primary" | "success" | "warning" | "info" | "secondary";

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
  tabIndex?: -1;
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
  tabIndex,
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
        tabIndex={tabIndex}
        className={cn(
          "min-h-0 flex-1",
          scroll ? "no-scrollbar overflow-auto" : "overflow-visible",
          applyPadding && (isCompact ? "p-3" : "p-4"),
          className,
        )}
      >
        <div
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
  compactOnMobile?: boolean;
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
  compactOnMobile = false,
}: AppPageHeaderProps) {
  const Heading = headingLevel;

  return (
    <>
      <header
        className={cn(
          "flex flex-col gap-2",
          compactOnMobile && "max-sm:gap-1",
          className,
        )}
      >
        {breadcrumb ? <div>{breadcrumb}</div> : null}
        <div
          className={cn(
            "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
            compactOnMobile && "max-sm:gap-1",
          )}
        >
          <div className="flex min-w-0 flex-col gap-1">
            {eyebrow ? (
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {eyebrow}
              </div>
            ) : null}
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <Heading
                className={cn(
                  "font-heading min-w-0 text-xl font-semibold tracking-tight sm:text-2xl",
                  compactOnMobile && "max-sm:text-base",
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
                className={cn(
                  "max-w-3xl text-sm leading-6 text-muted-foreground",
                  compactOnMobile && "max-sm:hidden",
                )}
              >
                {description}
              </div>
            ) : null}
            {meta ? (
              <div
                className={cn(
                  "text-xs text-muted-foreground",
                  compactOnMobile && "max-sm:hidden",
                )}
              >
                {meta}
              </div>
            ) : null}
          </div>
          {actions ? (
            <div
              className={cn(
                "flex shrink-0 flex-wrap items-center gap-2",
                compactOnMobile && "max-sm:hidden",
              )}
            >
              {actions}
            </div>
          ) : null}
        </div>
      </header>
      {tabs ? <div>{tabs}</div> : null}
    </>
  );
}

export type AppBackLinkProps = {
  href: string;
  children?: ReactNode;
  className?: string;
  "aria-label"?: string;
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
  "aria-label": ariaLabel,
  ...props
}: AppBackLinkProps) {
  return (
    <Button
      variant="ghost"
      size={children == null ? "icon-touch" : "touch"}
      className={cn(
        "justify-center gap-1 px-2 text-muted-foreground hover:underline",
        className,
      )}
      render={
        <Link
          href={href}
          aria-label={
            ariaLabel ?? (children == null ? ACTIONS_VI.back : undefined)
          }
          {...props}
        />
      }
    >
      <IconArrowLeft className="size-4" aria-hidden="true" />
      {children != null ? (
        <>
          {" "}
          {children}
        </>
      ) : null}
    </Button>
  );
}

type AppSectionTone = "default" | "info" | "warning" | "destructive";
export type AppSectionHeadingLevel =
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6";

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
  /** Use only when this visible section title participates in the page heading hierarchy. */
  headingLevel?: AppSectionHeadingLevel;
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
  footer?: ReactNode;
};

export function AppSection({
  title,
  headingLevel,
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
  footer,
}: AppSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
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
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => setOpen((v) => !v)}
      className="text-muted-foreground hover:text-foreground transition-colors"
      aria-expanded={open}
      aria-label={open ? "Thu gọn" : "Mở rộng"}
    >
      <IconChevronDown
        className={cn(
          "size-4 transition-transform",
          open ? "rotate-0" : "-rotate-90",
        )}
      />
    </Button>
  ) : null;

  return (
    <Card size={size} className={cn(SECTION_TONE_CLASSNAME[tone], className)}>
      {hasHeader ? (
        <CardHeader className="has-data-[slot=card-action]:grid-cols-1 sm:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
          <CardTitle
            as={headingLevel}
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
              <span className="min-w-0 break-words leading-snug">{title}</span>
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
            <CardAction className="col-start-1 row-span-1 row-start-auto justify-self-start flex flex-wrap items-center justify-start gap-2 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:justify-self-end sm:justify-end">
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
      ) : null}
      {open && footer ? (
        <CardFooter className="flex items-center justify-end gap-2 border-t">
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  );
}

export type AppListFrameProps = Omit<
  AppSectionProps,
  "children" | "className" | "contentFlush"
> & {
  children: ReactNode;
  className?: string;
  toolbar?: ReactNode;
};

/** Owner LIST card: optional inline toolbar + flush table/content. */
export function AppListFrame({
  children,
  className,
  toolbar,
  ...sectionProps
}: AppListFrameProps) {
  return (
    <AppSection
      {...sectionProps}
      className={cn("overflow-hidden", className)}
      contentFlush
    >
      {toolbar}
      {children}
    </AppSection>
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
        <ToolbarGroup className="shrink-0 gap-2">{filters}</ToolbarGroup>
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
      <Toolbar className={cn("gap-3 border-b border-border p-3", className)}>
        {content}
      </Toolbar>
    );
  }

  return (
    <Card size="sm">
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
      <div className={cn("flex min-w-0 flex-col gap-4", bodyClassName)}>
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
  selected = false,
  tone = "default",
  variant,
  className,
  ...props
}: OperationalTileProps) {
  return (
    <Button
      variant={variant ?? (selected ? "default" : "outline")}
      className={cn(
        selected
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
      className={cn(
        "h-full transition",
        disabled
          ? "cursor-not-allowed opacity-60"
          : "hover:shadow-effect-card-hover focus-within:shadow-effect-card-hover focus-within:ring-[3px] focus-within:ring-foreground",
      )}
    >
      <CardContent flush className="h-full">
        {disabled ? (
          <div aria-disabled="true" className="h-full">
            {inner}
          </div>
        ) : (
          <Link href={href} className="block h-full">
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
    <dl className={cn("flex flex-col gap-3", className)}>
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
      className={cn(
        "flex border-t border-border",
        mobileReverse ? "flex-col-reverse" : "flex-col",
        stacked
          ? "sm:flex-col sm:items-stretch"
          : "sm:flex-row sm:items-center sm:justify-between",
        sticky
          ? "sticky bottom-[var(--app-bottom-nav-offset,0px)] z-10 gap-2 bg-background p-2 shadow-lg [&_[data-slot=button]]:w-full sm:[&_[data-slot=button]]:w-auto lg:bottom-0"
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
