"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import { ACTIONS_VI } from "@comtammatu/shared/messages";
import { cn } from "@comtammatu/ui";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import { Button } from "@comtammatu/ui/components/button";

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
    <div>
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
                  "max-sm:line-clamp-2 max-sm:break-words",
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
    </div>
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
