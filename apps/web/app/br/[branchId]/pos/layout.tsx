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
      className="min-h-dvh w-full  flex h-dvh min-h-screen touch-manipulation overflow-hidden"
    >
      <div className="flex min-h-full w-full flex-1 p-3 md:p-4">
        <div className="rounded-lg border bg-background shadow-sm relative flex min-h-full w-full flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </main>
  );
}
