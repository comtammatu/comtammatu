import Link from "next/link";
import type { ElementType } from "react";
import { ArrowRight as IconArrowRight } from "lucide-react";
import { cn } from "@comtammatu/ui";
import { Badge, type BadgeProps } from "@comtammatu/ui/components/badge";
import { Card, CardContent } from "@comtammatu/ui/components/card";

type SurfaceLinkCardTone = "primary" | "success" | "info" | "secondary";

export interface SurfaceLinkCardProps {
  href: string;
  title: string;
  description?: string;
  badge?: string;
  badgeVariant?: BadgeProps["variant"];
  icon: ElementType;
  tone?: SurfaceLinkCardTone;
  ctaLabel?: string;
}

const TONE_CLASSNAME: Record<SurfaceLinkCardTone, string> = {
  primary: "bg-primary/10 text-primary",
  success: "bg-success/10 text-success",
  info: "bg-info/10 text-info",
  secondary: "bg-secondary text-secondary-foreground",
};

export function SurfaceLinkCard({
  href,
  title,
  description,
  badge,
  badgeVariant = "secondary",
  icon: Icon,
  tone = "primary",
  ctaLabel = "Mở chi tiết",
}: SurfaceLinkCardProps) {
  return (
    <Card className="h-full border bg-card shadow-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="h-full p-0">
        <Link
          href={href}
          className="group flex h-full flex-col justify-between gap-5 p-5"
        >
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div
                className={cn(
                  "flex size-11 items-center justify-center rounded-2xl",
                  TONE_CLASSNAME[tone],
                )}
              >
                <Icon className="size-5" />
              </div>
              {badge ? (
                <Badge variant={badgeVariant} className="rounded-full px-3 py-1">
                  {badge}
                </Badge>
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="text-base font-semibold tracking-tight">{title}</p>
              {description ? (
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-transform group-hover:translate-x-0.5">
            {ctaLabel}
            <IconArrowRight className="size-4" />
          </span>
        </Link>
      </CardContent>
    </Card>
  );
}
