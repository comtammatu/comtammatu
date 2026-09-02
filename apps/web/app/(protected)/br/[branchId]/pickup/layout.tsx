import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PwaRuntimeProvider as OperationalPwaProvider } from "@/components/pwa-runtime";
import { ScreenWakeLock } from "@/components/screen-wake-lock";
import { PickupPwaToolbar } from "../_components/operational-pwa/toolbar";
import { PickupLightMode } from "./pickup-light-mode";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ branchId: string }>;
}): Promise<Metadata> {
  const { branchId } = await params;
  return {
    manifest: `/br/${branchId}/pickup/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Má Tư Gọi số",
    },
  };
}

export default async function PickupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="theme-light-only chrome-safe-pt flex h-dvh min-h-dvh flex-col overflow-hidden bg-background text-foreground touch-manipulation"
    >
      <PickupLightMode />
      <ScreenWakeLock />
      <OperationalPwaProvider>
        <PickupPwaToolbar branchId={branchId} />
        {children}
      </OperationalPwaProvider>
    </main>
  );
}
