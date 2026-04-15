import type { ReactNode } from "react";

export default function BetaLayout({ children }: { children: ReactNode }) {
  return <div data-beta-ui>{children}</div>;
}
