import type { ReactNode } from "react";
import { cn } from "@comtammatu/ui";

export function MobilePage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
