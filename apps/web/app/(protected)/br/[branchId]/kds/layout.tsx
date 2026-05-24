import type { ReactNode } from "react";

export default function KdsLayout({
  children,
}: {
  children: ReactNode;
  params: Promise<{ branchId: string }>;
}) {
  return (
    <main className="flex h-dvh flex-col overflow-hidden touch-manipulation">
      {children}
    </main>
  );
}
