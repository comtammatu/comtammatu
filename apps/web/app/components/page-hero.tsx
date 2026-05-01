import type { ReactNode } from "react";
import { Badge } from "@comtammatu/ui/components/badge";
import { Card, CardContent } from "@comtammatu/ui/components/card";
import { cn } from "@comtammatu/ui";

interface PageHeroProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHero({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeroProps) {
  return (
    <Card className={className}>
      <CardContent className="p-5 sm:p-6">
        <div className={cn("flex flex-col gap-4", actions ? "xl:flex-row xl:items-start xl:justify-between" : null)}>
          <div className="space-y-2">
            {eyebrow ? (
              <Badge variant="secondary" className="rounded-md px-2.5 py-1 text-xs font-medium">
                {eyebrow}
              </Badge>
            ) : null}
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {title}
            </h2>
            {description ? (
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2 self-start">
              {actions}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
