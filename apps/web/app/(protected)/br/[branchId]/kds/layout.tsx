import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ForceLightMode } from "@/components/force-light-mode";
import { OperationalPwaProvider } from "../_components/operational-pwa/provider";
import { KdsPwaToolbar } from "../_components/operational-pwa/toolbar";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ branchId: string }>;
}): Promise<Metadata> {
  const { branchId } = await params;
  return {
    manifest: `/br/${branchId}/kds/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Má Tư KDS",
    },
  };
}

export default async function KdsLayout({
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
      className="theme-light-only chrome-safe-pt flex h-dvh flex-col overflow-hidden bg-background text-foreground touch-manipulation"
    >
      <ForceLightMode />
      <OperationalPwaProvider>
        <KdsPwaToolbar branchId={branchId} />
        {children}
      </OperationalPwaProvider>
    </main>
  );
}
