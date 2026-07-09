import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PosPwaProvider } from "./_components/pwa/online-status-provider";
import { PosPwaToolbar } from "./_components/pwa/pos-pwa-toolbar";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ branchId: string }>;
}): Promise<Metadata> {
  const { branchId } = await params;
  return {
    manifest: `/br/${branchId}/pos/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Má Tư POS",
    },
  };
}

export default async function PosLayout({
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
      className="flex h-dvh min-h-dvh w-full flex-col touch-manipulation overflow-hidden bg-background md:min-h-screen"
    >
      <PosPwaProvider>
        <PosPwaToolbar branchId={branchId} />
        {children}
      </PosPwaProvider>
    </main>
  );
}
