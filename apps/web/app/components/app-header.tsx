import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { BrandLogoBox, BrandMark } from "@/components/brand";

interface AppHeaderBrandProps {
  title: ReactNode;
  subtitle?: ReactNode;
  subtitleHiddenOnMobile: boolean;
}

/**
 * Brand mark + title/subtitle text block shared by the standalone header
 * lockup (design-system.md § B). Internal to `AppHeader` — the Management
 * sidebar keeps its own brand block because it renders a different box
 * (icon-or-seal, sidebar tone) and text hierarchy (uppercase label above the
 * bold name, not title-above-subtitle).
 */
function AppHeaderBrand({
  title,
  subtitle,
  subtitleHiddenOnMobile,
}: AppHeaderBrandProps) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <BrandLogoBox>
        <BrandMark decorative className="size-full" />
      </BrandLogoBox>
      <div className="min-w-0">
        <p className="font-heading truncate text-sm font-semibold sm:text-base">
          {title}
        </p>
        {subtitle ? (
          <p
            className={cn(
              "truncate text-xs text-muted-foreground",
              subtitleHiddenOnMobile && "hidden sm:block",
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export interface AppHeaderProps {
  /** Bold primary line next to the brand mark (branch name, staff app title, …). */
  title: ReactNode;
  /** Muted line under the title; hidden on the narrowest phones when `subtitleHiddenOnMobile`. */
  subtitle?: ReactNode;
  /** Hide the subtitle line below `sm:` — matches the pre-extraction Employee header. */
  subtitleHiddenOnMobile?: boolean;
  /** Optional middle slot between the brand block and actions (e.g. desktop tab nav). */
  nav?: ReactNode;
  /** Trailing controls (profile/notifications icon buttons, nav, …). */
  actions?: ReactNode;
  /** Row max-width breakpoint step-up; default matches the Branch runtime header. */
  wide?: boolean;
  className?: string;
}

/**
 * Canonical sticky brand-lockup header for standalone (non-sidebar) chrome:
 * the Branch runtime operator layout and the Employee/Operations PWA header.
 * Both consumers rendered the identical box + title/subtitle + actions row
 * before this extraction, so the markup is single-sourced here
 * (design-system.md § B header lockup).
 */
export function AppHeader({
  title,
  subtitle,
  subtitleHiddenOnMobile = false,
  nav,
  actions,
  wide = false,
  className,
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b bg-card/95 backdrop-blur print:hidden",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-lg items-center justify-between gap-2 px-3 py-1.5 sm:gap-3 sm:py-2",
          wide && "lg:max-w-3xl",
        )}
      >
        <AppHeaderBrand
          title={title}
          subtitle={subtitle}
          subtitleHiddenOnMobile={subtitleHiddenOnMobile}
        />
        {nav}
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
