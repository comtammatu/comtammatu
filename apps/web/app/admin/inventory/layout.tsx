import type { ReactNode } from "react";
import { InventorySubNav } from "./inventory-sub-nav";

export default function InventoryLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <InventorySubNav />
      {children}
    </div>
  );
}
