"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown as IconChevronDown } from "lucide-react";
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
        <CardHeader className="shrink-0 has-data-[slot=card-action]:grid-cols-1 sm:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
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
              <span className="max-w-[10rem] shrink-0 truncate text-xs font-medium text-muted-foreground sm:max-w-xs sm:text-right">
                {headerHint}
              </span>
            ) : null}
          </CardTitle>
          {description ? (
            <CardDescription className="min-w-0 line-clamp-2 break-words">
              {description}
            </CardDescription>
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
        <CardFooter className="flex shrink-0 items-center justify-end gap-2 border-t">
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  );
}
