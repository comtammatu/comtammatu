import Link from "next/link";
import { ArrowLeft as IconArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";

interface MobileSectionHeaderProps {
  title: string;
  eyebrow?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  action?: ReactNode;
  className?: string;
}

export function MobileSectionHeader({
  title,
  eyebrow,
  description,
  backHref,
  backLabel = "Quay lại",
  action,
  className,
}: MobileSectionHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
          {backLabel}
        </Link>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {eyebrow ? (
            <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-xl font-semibold leading-tight tracking-tight">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
    </div>
  );
}
