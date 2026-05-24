import type { ReactNode } from "react";

export default function RunnerLayout({
  children,
}: {
  children: ReactNode;
  params: Promise<{ branchId: string }>;
}) {
  return (
    <main className="flex h-dvh min-h-dvh flex-col overflow-hidden bg-background text-foreground touch-manipulation">
      {children}
    </main>
  );
}
