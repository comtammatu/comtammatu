import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@comtammatu/ui";
import { BRAND_NAME, BrandLogoBox, BrandMark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export interface AppHeaderBrandProps {
  title: ReactNode;
  subtitle?: ReactNode;
  subtitleHiddenOnMobile: boolean;
  showText: boolean;
  href?: string;
  ariaLabel?: string;
}

/**
 * Brand mark + title/subtitle text block shared by approved standalone chrome
 * and compact header fragments (design-system.md § B).
 */
export function AppHeaderBrand({
  title,
  subtitle,
  subtitleHiddenOnMobile,
  showText,
  href,
  ariaLabel,
}: AppHeaderBrandProps) {
  const content = (
    <>
      <BrandLogoBox>
        <BrandMark decorative className="size-full" />
      </BrandLogoBox>
      {showText ? (
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
      ) : null}
    </>
  );
  const className = cn(
    "flex items-center gap-2",
    showText ? "min-w-0" : "min-h-11 min-w-11 shrink-0 justify-center",
  );
  const linkAriaLabel = ariaLabel || (!showText ? BRAND_NAME : undefined);

  return href ? (
    <Link
      href={href}
      aria-label={linkAriaLabel}
      className={cn(
        className,
        "rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground",
      )}
    >
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

export interface AppHeaderProps {
  /** Bold primary line next to the brand mark (branch name, staff app title, …). */
  title: ReactNode;
  /** Muted line under the title; hidden on the narrowest phones when `subtitleHiddenOnMobile`. */
  subtitle?: ReactNode;
  /** Hide the subtitle line below `sm:` — matches the pre-extraction Employee header. */
  subtitleHiddenOnMobile?: boolean;
  /** Hide title/subtitle when compact app chrome should keep only the brand mark. */
  showBrandText?: boolean;
  /** Optional middle slot between the brand block and actions (e.g. desktop tab nav). */
  nav?: ReactNode;
  /** Optional brand link, used by app-like shells as a home affordance. */
  homeHref?: string;
  homeAriaLabel?: string;
  /** Trailing controls (profile/notifications icon buttons, nav, …). */
  actions?: ReactNode;
  /** Row max-width breakpoint step-up; default matches the Branch runtime header. */
  wide?: boolean;
  className?: string;
  showThemeToggle?: boolean;
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
  showBrandText = true,
  nav,
  homeHref,
  homeAriaLabel,
  actions,
  wide = false,
  className,
  showThemeToggle = true,
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b bg-card/95 backdrop-blur chrome-tap select-none print:hidden",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-lg items-center justify-between gap-2 px-3 py-1.5 sm:gap-3 sm:py-2",
          wide && "sm:max-w-2xl lg:max-w-5xl xl:max-w-6xl 2xl:max-w-screen-2xl",
        )}
      >
        <AppHeaderBrand
          title={title}
          subtitle={subtitle}
          subtitleHiddenOnMobile={subtitleHiddenOnMobile}
          showText={showBrandText}
          href={homeHref}
          ariaLabel={homeAriaLabel}
        />
        {nav}
        <div className="flex shrink-0 items-center gap-2">
          {showThemeToggle ? (
            <ThemeToggle variant="outline" size="icon-touch" />
          ) : null}
          {actions}
        </div>
      </div>
    </header>
  );
}
