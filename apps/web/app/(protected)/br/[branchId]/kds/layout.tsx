import type { Metadata } from "next";
import type { ReactNode } from "react";
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
      statusBarStyle: "default",
      title: `CTMT KDS CN${branchId}`,
    },
  };
}

export default function KdsLayout({
  children,
}: {
  children: ReactNode;
  params: Promise<{ branchId: string }>;
}) {
  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-background text-foreground touch-manipulation">
      <OperationalPwaProvider>
        <KdsPwaToolbar />
        {children}
      </OperationalPwaProvider>
    </main>
  );
}
