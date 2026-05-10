/**
 * matu-surface.tsx — compatibility surface adapters for token QA.
 *
 * Mirrors matu-superapp/apps/backoffice_web/app/components/surface.tsx.
 * New route work should use the canonical adapters in
 * `apps/web/app/components/surface.tsx`; this file remains for kitchen-sink
 * and explicit generated-token QA.
 *
 * Design contract: see docs/spec/design-system.md and
 * `~/Downloads/matu-superapp/DESIGN.md`. Tokens namespaced `matu-*`
 * (generated from `packages/design-tokens/tokens.json`).
 *
 * Apple-grade discipline:
 * - Border-first elevation. No card shadows (only popover/dialog).
 * - 8px default radius. Cards never exceed 8px.
 * - 4px spacing grid. Page padding 16px mobile / 24px desktop.
 * - Vietnamese operational copy. No marketing prose.
 * - Cards earn their existence; no decorative dashboard mosaic.
 */

import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";

/* -------------------------------------------------------------------------- */
/*  PageSurface                                                               */
/* -------------------------------------------------------------------------- */

export interface PageSurfaceProps {
  /** Page title (Vietnamese operational copy). */
  title: string;
  /** Optional eyebrow above title (small label, scope context). */
  eyebrow?: ReactNode;
  /** Optional one-line subtitle. Vietnamese operational copy. */
  subtitle?: ReactNode;
  /** Right-aligned actions in the header row (primary button, etc.). */
  actions?: ReactNode;
  /** Optional metadata below subtitle (small contextual data). */
  meta?: ReactNode;
  /** Optional tabs/segmented control rendered below the header. */
  tabs?: ReactNode;
  children: ReactNode;
  /** Optional className override for the main wrapper. */
  className?: string;
}

export function PageSurface({
  title,
  eyebrow,
  subtitle,
  actions,
  meta,
  tabs,
  children,
  className,
}: PageSurfaceProps) {
  return (
    <main
      className={cn(
        "mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 font-matu-body bg-matu-background text-matu-foreground md:p-6",
        className,
      )}
    >
      <header className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            {eyebrow ? (
              <div className="text-xs font-medium uppercase tracking-wide text-matu-muted-foreground">
                {eyebrow}
              </div>
            ) : null}
            <h1 className="text-xl font-semibold tracking-tight text-matu-foreground md:text-2xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="max-w-3xl text-sm leading-6 text-matu-muted-foreground">
                {subtitle}
              </p>
            ) : null}
            {meta ? (
              <div className="text-xs text-matu-muted-foreground">{meta}</div>
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
      {children}
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*  SectionCard                                                                */
/* -------------------------------------------------------------------------- */

export interface SectionCardProps {
  title?: string;
  description?: string;
  /** Right-aligned actions in the section header. */
  actions?: ReactNode;
  children: ReactNode;
  /** Optional className override for the outer card. */
  className?: string;
  /** Optional inner padding override (default: p-4 md:p-5). */
  contentClassName?: string;
}

/**
 * Framed group of related operational content. Use only when the content is
 * genuinely a "panel"; do NOT wrap every component in a card. Cards earn
 * their existence — repeated items, actionable navigation, or framed tools.
 *
 * Border-first surface: 1px border, no shadow, 8px radius.
 */
export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: SectionCardProps) {
  const hasHeader = Boolean(title || description || actions);
  return (
    <section
      className={cn(
        "rounded-matu-md border border-matu-border bg-matu-card text-matu-card-foreground",
        className,
      )}
    >
      {hasHeader ? (
        <header className="flex flex-row items-start justify-between gap-3 border-b border-matu-border p-4 md:p-5">
          <div className="min-w-0 space-y-1">
            {title ? (
              <h2 className="text-base font-semibold tracking-tight">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="text-sm text-matu-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </header>
      ) : null}
      <div className={cn("p-4 md:p-5", contentClassName)}>{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  ToolbarRow                                                                 */
/* -------------------------------------------------------------------------- */

export interface ToolbarRowProps {
  /** Left-aligned filter / segment / search children. */
  filters?: ReactNode;
  /** Right-aligned primary action(s). */
  actions?: ReactNode;
  /** Optional className override. */
  className?: string;
}

/**
 * Filters, search, segmented controls, and a primary action. Mobile-first;
 * collapses to stacked layout below `md`. Touch-safe gap (8px / space-2).
 */
export function ToolbarRow({ filters, actions, className }: ToolbarRowProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-stretch gap-2 md:flex-row md:items-center md:justify-between",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">{filters}</div>
      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  EmptyState                                                                 */
/* -------------------------------------------------------------------------- */

export interface EmptyStateProps {
  /** Required: icon (Lucide), 32px max. */
  icon?: ReactNode;
  /** Required: short Vietnamese title. */
  title: string;
  /** Optional one-line description (max 480px width). */
  description?: ReactNode;
  /** Optional action button(s). */
  action?: ReactNode;
  /** Optional className override. */
  className?: string;
}

/**
 * Empty / no-results / no-data / blocked state.
 *
 * Per DESIGN.md §Empty: warm message, primary action, no large decorative
 * artwork. Icon ≤32px. Copy max width 480px.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-matu-md border border-matu-border bg-matu-card p-8 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="flex size-12 items-center justify-center rounded-matu-full bg-matu-muted text-matu-muted-foreground [&>svg]:size-6">
          {icon}
        </div>
      ) : null}
      <div className="max-w-md space-y-1">
        <p className="text-base font-semibold text-matu-foreground">{title}</p>
        {description ? (
          <p className="text-sm text-matu-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
