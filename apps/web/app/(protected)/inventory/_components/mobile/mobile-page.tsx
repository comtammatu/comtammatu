import type { ReactNode } from "react";
import { AppPage } from "@/components/surface";

export function MobilePage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <AppPage width="narrow" contentClassName={className}>
      {children}
    </AppPage>
  );
}
