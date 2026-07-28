import type { Metadata } from "next";
import type { ReactNode } from "react";
import { loadAuthState } from "@/_lib/auth";
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
  // POS layout historically skipped loadAuthState (shell-only). Probe Auth
  // liveness here so far-from-expiry zombie JWTs after global signOut clear
  // before serving the station UI. Cache-deduped with any page-level call.
  await loadAuthState();
  const { branchId } = await params;

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="chrome-safe-pt flex h-dvh min-h-dvh w-full flex-col touch-manipulation overflow-hidden bg-background md:min-h-screen"
    >
      <PosPwaProvider>
        <PosPwaToolbar branchId={branchId} />
        {children}
      </PosPwaProvider>
    </main>
  );
}
