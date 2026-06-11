import type { Metadata } from "next";
import type { ReactNode } from "react";
import { OperationalPwaProvider } from "../_components/operational-pwa/provider";
import { RunnerPwaToolbar } from "../_components/operational-pwa/toolbar";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ branchId: string }>;
}): Promise<Metadata> {
  const { branchId } = await params;
  return {
    manifest: `/br/${branchId}/runner/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "Má Tư Gọi số",
    },
  };
}

export default async function RunnerLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ branchId: string }>;
}) {
  const { branchId } = await params;

  return (
    <main className="flex h-dvh min-h-dvh flex-col overflow-hidden bg-background text-foreground touch-manipulation">
      <OperationalPwaProvider>
        <RunnerPwaToolbar branchId={branchId} />
        {children}
      </OperationalPwaProvider>
    </main>
  );
}
