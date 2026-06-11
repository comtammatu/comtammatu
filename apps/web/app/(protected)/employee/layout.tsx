import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PwaRuntimeProvider } from "@/components/pwa-runtime";
import { AppPage } from "@/components/surface";
import { MobileHeader } from "./components/mobile-header";
import { BottomNav } from "./components/bottom-nav";
import { EmployeePwaToolbar } from "./components/employee-pwa-toolbar";

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Má Tư NV",
  },
};

export default function EmployeeLayout({ children }: { children: ReactNode }) {
  return (
    <PwaRuntimeProvider>
      <div className="flex min-h-dvh w-full flex-col bg-muted/30">
        <MobileHeader />
        <EmployeePwaToolbar />
        <main id="main-content" className="flex min-h-0 flex-1 flex-col">
          <AppPage
            density="compact"
            mobile
            contentClassName="max-w-lg lg:max-w-3xl"
          >
            {children}
          </AppPage>
        </main>
        <BottomNav />
      </div>
    </PwaRuntimeProvider>
  );
}
