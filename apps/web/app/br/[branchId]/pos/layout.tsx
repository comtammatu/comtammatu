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
      statusBarStyle: "default",
      title: `CTMT POS CN${branchId}`,
    },
  };
}

export default function PosLayout({
  children,
}: {
  children: ReactNode;
  params: Promise<{ branchId: string }>;
}) {
  return (
    <main
      id="main-content"
      className="flex h-svh min-h-svh w-full flex-col touch-manipulation overflow-hidden bg-background md:h-dvh md:min-h-screen"
    >
      <PosPwaProvider>
        <PosPwaToolbar />
        {children}
      </PosPwaProvider>
    </main>
  );
}
