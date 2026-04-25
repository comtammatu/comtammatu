"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import {
  ChevronDown as IconChevronDown,
  ChevronRight as IconChevronRight,
} from "lucide-react";
import { Badge } from "@comtammatu/ui/components/badge";
import { cn } from "@comtammatu/ui";
import type { PlaybookSeverity } from "../../_lib/playbook-types";

const SEVERITY_DOT: Record<PlaybookSeverity, string> = {
  destructive: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
  primary: "bg-primary",
};

const SEVERITY_BORDER: Record<PlaybookSeverity, string> = {
  destructive: "border-l-destructive",
  warning: "border-l-warning",
  info: "border-l-info",
  primary: "border-l-primary",
};

interface MobilePlaybookTaskCardProps {
  icon: ComponentType<{ className?: string }>;
  severity: PlaybookSeverity;
  title: string;
  description: string;
  count?: number;
  meta?: string | null;
  /** Top-3 preview items shown after expand. Caller pre-formats. */
  preview?: string[];
  /** Total items for the "+N nữa" hint when preview is truncated. */
  totalItems?: number;
  /** "Xem tất cả" deeplink — opens the relevant sub-route, branchId already baked in. */
  deeplink?: { href: string; label?: string };
}

/**
 * Single task card for the mobile playbook feed. Tap card body → toggle
 * inline expand with up to 3 preview rows; "Xem tất cả" takes the user to
 * the full surface. No dialog, no sheet inline — Mobile-A1 keeps the
 * flow shallow on purpose; complex inline actions wait for Mobile-A2.
 */
export function MobilePlaybookTaskCard({
  icon: Icon,
  severity,
  title,
  description,
  count,
  meta,
  preview,
  totalItems,
  deeplink,
}: MobilePlaybookTaskCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasPreview = preview != null && preview.length > 0;
  const remaining =
    totalItems != null && hasPreview ? totalItems - preview.length : 0;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 border border-l-4 bg-card p-3",
        SEVERITY_BORDER[severity],
      )}
    >
      <button
        type="button"
        onClick={() => hasPreview && setExpanded((prev) => !prev)}
        aria-expanded={hasPreview ? expanded : undefined}
        className="flex items-start gap-3 text-left"
      >
        <span
          aria-hidden
          className={cn(
            "mt-1 size-2 shrink-0 rounded-full",
            SEVERITY_DOT[severity],
          )}
        />
        <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <p className="font-semibold leading-snug">{title}</p>
            {count != null ? (
              <Badge variant="outline" className="tabular-nums">
                {count}
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          {meta ? (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {meta}
            </p>
          ) : null}
        </div>
        {hasPreview ? (
          <IconChevronDown
            className={cn(
              "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden
          />
        ) : null}
      </button>

      {expanded && hasPreview ? (
        <ul className="ml-9 flex flex-col gap-1 text-sm">
          {preview.map((line, idx) => (
            <li
              key={`${idx}-${line}`}
              className="truncate text-muted-foreground"
            >
              · {line}
            </li>
          ))}
          {remaining > 0 ? (
            <li className="text-xs text-muted-foreground/80">
              +{remaining} nữa
            </li>
          ) : null}
        </ul>
      ) : null}

      {deeplink ? (
        <Link
          href={deeplink.href}
          prefetch={false}
          className="ml-9 inline-flex w-fit items-center gap-1 text-sm font-medium text-primary"
        >
          {deeplink.label ?? "Xem tất cả"}
          <IconChevronRight className="size-3.5" />
        </Link>
      ) : null}
    </div>
  );
}
