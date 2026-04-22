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
      className="flex h-dvh min-h-screen w-full flex-col touch-manipulation overflow-hidden bg-background"
    >
      {children}
    </main>
  );
}
