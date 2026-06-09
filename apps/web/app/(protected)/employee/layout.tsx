import type { ReactNode } from "react";
import { AppPage } from "@/components/surface";
import { MobileHeader } from "./components/mobile-header";
import { BottomNav } from "./components/bottom-nav";

export default function EmployeeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-background">
      <MobileHeader />
      <main id="main-content" className="flex min-h-0 flex-1 flex-col">
        <AppPage
          density="compact"
          mobile
          contentClassName="lg:max-w-5xl"
        >
          {children}
        </AppPage>
      </main>
      <BottomNav />
    </div>
  );
}
