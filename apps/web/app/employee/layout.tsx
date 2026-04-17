import type { ReactNode } from "react";
import { workspaceThemeProps } from "@/lib/workspace-theme";
import { MobileHeader } from "./components/mobile-header";
import { BottomNav } from "./components/bottom-nav";

export default function EmployeeLayout({ children }: { children: ReactNode }) {
  return (
    <div
      {...workspaceThemeProps("employee")}
      className="workspace-shell flex min-h-dvh w-full flex-col"
    >
      <MobileHeader />
      <main
        id="main-content"
        className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 pb-32 sm:px-4 lg:px-6 lg:pb-6"
      >
        <div className="space-y-5">{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
