import type { ReactNode } from "react";
import { StockSectionNav } from "./stock-section-nav";

export default function StockSectionLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <StockSectionNav />
      <div>{children}</div>
    </div>
  );
}
