import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";
import { Card, CardContent } from "@comtammatu/ui/components/card";

export function SectionCard({
  children,
  className,
  contentClassName,
  density = "comfortable",
}: {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  density?: "compact" | "comfortable" | "touch";
}) {
  const paddingClassName =
    density === "compact"
      ? "p-4 md:p-5"
      : density === "touch"
        ? "p-6 md:p-7"
        : "p-5 md:p-6";

  return (
    <Card className={className}>
      <CardContent className={cn(paddingClassName, contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}
