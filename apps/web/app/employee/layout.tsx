import type { ReactNode } from "react";
import { MobileHeader } from "./components/mobile-header";
import { BottomNav } from "./components/bottom-nav";

export default function EmployeeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-background">
      <MobileHeader />
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-3 py-4 pb-28 sm:px-4 lg:pb-8"
      >
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
