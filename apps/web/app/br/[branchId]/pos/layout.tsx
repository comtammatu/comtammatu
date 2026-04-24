import type { ReactNode } from "react";

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
      {children}
    </main>
  );
}
